import NextAuth from "next-auth";
import { authConfig } from "@/core/auth/auth.config";

// Next.js 16 „proxy" (dříve middleware). Používá jen edge-safe konfiguraci
// (bez Prisma/bcryptu) — gate na přihlášení. RBAC per modul/akci řeší backend.
export default NextAuth(authConfig).auth;

export const config = {
  // Běží na všech cestách kromě API, statických assetů a souborů s příponou.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
