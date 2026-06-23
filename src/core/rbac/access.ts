// Centrální kontrola práv. Tyto helpery se používají NA BACKENDU
// (server komponenty, server actions, route handlery) — ne jen v UI.

/** Přihlášený uživatel tak, jak ho nese session/JWT. */
export interface AuthUser {
  id: string;
  jmeno: string;
  email: string;
  roleName: string;
  /** Klíče oprávnění, např. ["stock.view", "stock.export", "admin.view"]. */
  permissions: string[];
  /** ID odběratelů přiřazených zástupci (viditelnost dat). Prázdné = bez omezení řeší role. */
  resellerIds: string[];
}

/** Má uživatel dané oprávnění? */
export function can(user: AuthUser | null | undefined, klic: string): boolean {
  if (!user) return false;
  return user.permissions.includes(klic);
}

/** Má uživatel alespoň jedno z daných oprávnění? */
export function canAny(
  user: AuthUser | null | undefined,
  klice: string[],
): boolean {
  if (!user) return false;
  return klice.some((k) => user.permissions.includes(k));
}

/** Má uživatel všechna daná oprávnění? */
export function canAll(
  user: AuthUser | null | undefined,
  klice: string[],
): boolean {
  if (!user) return false;
  return klice.every((k) => user.permissions.includes(k));
}

/** Chyba 403 — nedostatečná práva. */
export class ForbiddenError extends Error {
  constructor(klic: string) {
    super(`Chybí oprávnění: ${klic}`);
    this.name = "ForbiddenError";
  }
}

/** Vyhodí ForbiddenError, pokud uživatel nemá dané právo. Volat na backendu. */
export function assertPermission(
  user: AuthUser | null | undefined,
  klic: string,
): asserts user is AuthUser {
  if (!can(user, klic)) {
    throw new ForbiddenError(klic);
  }
}
