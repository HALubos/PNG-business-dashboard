import { NextResponse, type NextRequest } from "next/server";

import { getCurrentUser } from "@/core/auth/session";
import { can } from "@/core/rbac/access";
import { prisma } from "@/lib/prisma";
import { canViewProject } from "@/core/projects/project-scope";
import {
  metaOAuthConfig,
  buildMetaAuthUrl,
  encodeMetaState,
} from "@/core/connectors/oauth/meta";

// Start Meta Ads OAuth flow. Formulář karty (GET) sem pošle projectId + adAccountId;
// po validaci přesměrujeme na Facebook consent (scope ads_read). Výměna v callbacku.

const PROJECTS_VIEWALL = "admin.projects";

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

  const projectId = req.nextUrl.searchParams.get("projectId") ?? "";
  const adAccountId = (req.nextUrl.searchParams.get("adAccountId") ?? "").replace(
    /[^0-9]/g,
    "",
  );

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { klic: true },
  });
  if (!project) return backToIntegrace(req, { oauth: "error" });
  if (!(await canViewProject(user, projectId, PROJECTS_VIEWALL))) {
    return new Response("K tomuto projektu nemáte přístup.", { status: 403 });
  }
  if (!adAccountId) {
    return backToIntegrace(req, { projekt: project.klic, oauth: "badaccount" });
  }

  const cfg = metaOAuthConfig();
  if (!cfg) return backToIntegrace(req, { projekt: project.klic, oauth: "nometa" });

  const state = encodeMetaState({ projectId, adAccountId, klic: project.klic });
  return NextResponse.redirect(buildMetaAuthUrl(cfg, state));
}
