import { NextResponse, type NextRequest } from "next/server";

import { getCurrentUser } from "@/core/auth/session";
import { can } from "@/core/rbac/access";
import { prisma } from "@/lib/prisma";
import { canViewProject } from "@/core/projects/project-scope";
import {
  googleOAuthConfig,
  buildGoogleAuthUrl,
  encodeState,
  GOOGLE_ADS_SCOPE,
  GOOGLE_ADS_CALLBACK_PATH,
} from "@/core/connectors/oauth/google";

// Start Google Ads OAuth flow. Formulář karty (GET) sem pošle projectId +
// customerId (+ volitelně loginCustomerId pro MCC); po validaci přesměrujeme na
// Google consent (scope `adwords`). Token výměna proběhne v callbacku.

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
  const customerId = (req.nextUrl.searchParams.get("customerId") ?? "").replace(
    /\D/g,
    "",
  );
  const loginCustomerId = (
    req.nextUrl.searchParams.get("loginCustomerId") ?? ""
  ).replace(/\D/g, "");

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { klic: true },
  });
  if (!project) return backToIntegrace(req, { oauth: "error" });
  if (!(await canViewProject(user, projectId, PROJECTS_VIEWALL))) {
    return new Response("K tomuto projektu nemáte přístup.", { status: 403 });
  }
  if (!customerId) {
    return backToIntegrace(req, { projekt: project.klic, oauth: "badcustomer" });
  }

  const cfg = googleOAuthConfig(GOOGLE_ADS_CALLBACK_PATH);
  if (!cfg) return backToIntegrace(req, { projekt: project.klic, oauth: "noconfig" });

  const state = encodeState({
    projectId,
    customerId,
    loginCustomerId: loginCustomerId || undefined,
    klic: project.klic,
  });
  return NextResponse.redirect(buildGoogleAuthUrl(cfg, GOOGLE_ADS_SCOPE, state));
}
