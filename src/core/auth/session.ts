import { redirect } from "next/navigation";

import { auth } from "./auth";
import type { AuthUser } from "@/core/rbac/access";

/** Vrátí přihlášeného uživatele (nebo null). Pro server komponenty/akce. */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const session = await auth();
  if (!session?.user) return null;
  return {
    id: session.user.id,
    jmeno: session.user.jmeno,
    email: session.user.email ?? "",
    roleName: session.user.roleName,
    permissions: session.user.permissions ?? [],
    resellerIds: session.user.resellerIds ?? [],
  };
}

/** Vyžaduje přihlášení; jinak přesměruje na /login. */
export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Vyžaduje konkrétní oprávnění (per modul + akce). Vynuceno NA BACKENDU.
 * Bez práva přesměruje na rozcestník s příznakem.
 */
export async function requirePermission(klic: string): Promise<AuthUser> {
  const user = await requireUser();
  if (!user.permissions.includes(klic)) {
    redirect(`/?forbidden=${encodeURIComponent(klic)}`);
  }
  return user;
}
