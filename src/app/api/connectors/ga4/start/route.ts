import { NextResponse, type NextRequest } from "next/server";

import { getCurrentUser } from "@/core/auth/session";
import { can } from "@/core/rbac/access";
import { prisma } from "@/lib/prisma";
import { canViewProject } from "@/core/projects/project-scope";
import {
  googleOAuthConfig,
  buildGoogleAuthUrl,
  encodeState,
  GA4_SCOPE,
} from "@/core/connectors/oauth/google";

// Start GA4 OAuth flow. Formulář karty (GET) sem pošle projectId + propertyId;
// po validaci přesměrujeme na Google consent. Token výměna proběhne v callbacku.

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
  const propertyId = (req.nextUrl.searchParams.get("propertyId") ?? "").trim();

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { klic: true },
  });
  if (!project) return backToIntegrace(req, { oauth: "error" });
  if (!(await canViewProject(user, projectId, PROJECTS_VIEWALL))) {
    return new Response("K tomuto projektu nemáte přístup.", { status: 403 });
  }
  if (!/^\d+$/.test(propertyId)) {
    return backToIntegrace(req, { projekt: project.klic, oauth: "badproperty" });
  }

  const cfg = googleOAuthConfig();
  if (!cfg) return backToIntegrace(req, { projekt: project.klic, oauth: "noconfig" });

  const state = encodeState({ projectId, propertyId, klic: project.klic });
  return NextResponse.redirect(buildGoogleAuthUrl(cfg, GA4_SCOPE, state));
}
