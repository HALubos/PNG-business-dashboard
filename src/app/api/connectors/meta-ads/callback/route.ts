import { NextResponse, type NextRequest } from "next/server";

import { getCurrentUser } from "@/core/auth/session";
import { can } from "@/core/rbac/access";
import { prisma } from "@/lib/prisma";
import { encryptJson } from "@/core/connectors/crypto";
import { getConnectorAdapter } from "@/core/connectors/registry";
import { startConnectorSync } from "@/core/connectors/sync";
import { canViewProject } from "@/core/projects/project-scope";
import {
  metaOAuthConfig,
  decodeMetaState,
  exchangeCodeForToken,
  exchangeForLongLivedToken,
} from "@/core/connectors/oauth/meta";

// Meta Ads OAuth callback — Meta sem vrátí `code` + `state`. Vyměníme code za
// krátkodobý token, ten za DLOUHODOBÝ (~60 dní), uložíme token + adAccountId
// ŠIFROVANĚ do Connector.credentialsEnc a spustíme backfill. Pak zpět na /integrace.

const PROJECTS_VIEWALL = "admin.projects";

interface MetaState {
  projectId: string;
  adAccountId: string;
  klic: string;
}

function backToIntegrace(req: NextRequest, params: Record<string, string>) {
  const u = new URL("/integrace", req.nextUrl.origin);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return NextResponse.redirect(u);
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !can(user, "admin.connectors")) {
    return new Response("Nemáte oprávnění spravovat konektory.", { status: 403 });
  }

  const code = req.nextUrl.searchParams.get("code");
  const stateRaw = req.nextUrl.searchParams.get("state");
  const oauthError = req.nextUrl.searchParams.get("error");
  if (oauthError || !code || !stateRaw) {
    return backToIntegrace(req, { oauth: "error" });
  }

  let state: MetaState;
  try {
    state = decodeMetaState<MetaState>(stateRaw);
  } catch {
    return backToIntegrace(req, { oauth: "error" });
  }

  const cfg = metaOAuthConfig();
  if (!cfg) return backToIntegrace(req, { projekt: state.klic, oauth: "nometa" });
  if (!(await canViewProject(user, state.projectId, PROJECTS_VIEWALL))) {
    return new Response("K tomuto projektu nemáte přístup.", { status: 403 });
  }

  try {
    const short = await exchangeCodeForToken(cfg, code);
    const long = await exchangeForLongLivedToken(cfg, short.access_token);
    if (!long.access_token) {
      return backToIntegrace(req, { projekt: state.klic, oauth: "error" });
    }

    const adapter = getConnectorAdapter("meta_ads")!;
    const expiresAt = long.expires_in
      ? new Date(Date.now() + long.expires_in * 1000).toISOString()
      : null;
    const credentialsEnc = encryptJson({
      accessToken: long.access_token,
      adAccountId: state.adAccountId,
      expiresAt,
    });

    // syncStatus se NEResetuje (viz `startConnectorSync` — přepis běžícího
    // `processing` na `idle` by obešel zábor a spustil druhý souběžný sync).
    const connector = await prisma.connector.upsert({
      where: { projectId_type: { projectId: state.projectId, type: "meta_ads" } },
      update: {
        credentialsEnc,
        active: true,
        nazev: adapter.nazev,
        feedUrl: null,
        cursor: null,
        lastError: null,
      },
      create: {
        projectId: state.projectId,
        type: "meta_ads",
        kind: "oauth_api",
        nazev: adapter.nazev,
        credentialsEnc,
        active: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        akce: "connector.connect",
        entita: `Connector:${connector.id}`,
        detail: { type: "meta_ads", projectId: state.projectId },
      },
    });

    await startConnectorSync(connector.id);

    return backToIntegrace(req, { projekt: state.klic, oauth: "ok" });
  } catch {
    return backToIntegrace(req, { projekt: state.klic, oauth: "error" });
  }
}
