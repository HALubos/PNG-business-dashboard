import { NextResponse, type NextRequest } from "next/server";

import { getCurrentUser } from "@/core/auth/session";
import { can } from "@/core/rbac/access";
import { prisma } from "@/lib/prisma";
import { encryptJson } from "@/core/connectors/crypto";
import { getConnectorAdapter } from "@/core/connectors/registry";
import { startConnectorSync } from "@/core/connectors/sync";
import { canViewProject } from "@/core/projects/project-scope";
import {
  googleOAuthConfig,
  decodeState,
  exchangeCodeForTokens,
} from "@/core/connectors/oauth/google";

// GA4 OAuth callback — Google sem vrátí `code` + `state`. Vyměníme code za tokeny,
// uložíme refresh_token + propertyId ŠIFROVANĚ do Connector.credentialsEnc a
// spustíme backfill na pozadí. Pak zpět na /integrace.

const PROJECTS_VIEWALL = "admin.projects";

interface Ga4State {
  projectId: string;
  propertyId: string;
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

  let state: Ga4State;
  try {
    state = decodeState<Ga4State>(stateRaw);
  } catch {
    return backToIntegrace(req, { oauth: "error" });
  }

  const cfg = googleOAuthConfig();
  if (!cfg) return backToIntegrace(req, { projekt: state.klic, oauth: "noconfig" });
  if (!(await canViewProject(user, state.projectId, PROJECTS_VIEWALL))) {
    return new Response("K tomuto projektu nemáte přístup.", { status: 403 });
  }

  try {
    const tokens = await exchangeCodeForTokens(cfg, code);
    // refresh_token přijde jen při souhlasu s `prompt=consent` (vynuceno ve start).
    if (!tokens.refresh_token) {
      return backToIntegrace(req, { projekt: state.klic, oauth: "norefresh" });
    }

    const adapter = getConnectorAdapter("ga4")!;
    const credentialsEnc = encryptJson({
      refreshToken: tokens.refresh_token,
      propertyId: state.propertyId,
    });

    // Upsert dle (projectId, type): reconnect přepíše tokeny a NULUJE cursor →
    // další sync backfilluje od začátku (stejná logika jako u url_feed connect).
    // syncStatus se NEResetuje (viz `startConnectorSync` — přepis běžícího `processing`
    // na `idle` by obešel zábor a spustil druhý souběžný sync).
    const connector = await prisma.connector.upsert({
      where: { projectId_type: { projectId: state.projectId, type: "ga4" } },
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
        type: "ga4",
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
        detail: { type: "ga4", projectId: state.projectId },
      },
    });

    // Spustí backfill/sync na pozadí (UI pollu­je stav u karty).
    await startConnectorSync(connector.id);

    return backToIntegrace(req, { projekt: state.klic, oauth: "ok" });
  } catch {
    return backToIntegrace(req, { projekt: state.klic, oauth: "error" });
  }
}
