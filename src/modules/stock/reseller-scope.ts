import { prisma } from "@/lib/prisma";
import { can, type AuthUser } from "@/core/rbac/access";

// ─────────────────────────────────────────────────────────────
// Sdílený rozsah odběratelů dle RBAC. Používá modul `stock` i `analytics`
// (anti-drift). Parametrizováno klíčem „viewall" práva (stock.viewall /
// analytics.viewall), jinak je princip totožný.
//   - s `viewall`  → všichni odběratelé (kromě vlastních e-shopů),
//   - jinak        → jen odběratelé přiřazení přes RepCustomer.
// ─────────────────────────────────────────────────────────────

export interface ResellerRef {
  id: string;
  domena: string;
  nazev: string | null;
}

/** Odběratelé (bez vlastních e-shopů), které uživatel smí vidět. */
export async function getVisibleResellers(
  user: AuthUser,
  viewallPermission: string,
): Promise<ResellerRef[]> {
  const base = { jeVlastni: false } as const;
  const where = can(user, viewallPermission)
    ? base
    : { ...base, repLinks: { some: { userId: user.id } } };
  return prisma.reseller.findMany({
    where,
    orderBy: { domena: "asc" },
    select: { id: true, domena: true, nazev: true },
  });
}

/** Smí uživatel vidět daného odběratele? Vynuceno na backendu. */
export async function canViewReseller(
  user: AuthUser,
  resellerId: string,
  viewallPermission: string,
): Promise<boolean> {
  if (can(user, viewallPermission)) {
    const r = await prisma.reseller.findUnique({
      where: { id: resellerId },
      select: { jeVlastni: true },
    });
    return !!r && !r.jeVlastni;
  }
  const link = await prisma.repCustomer.findUnique({
    where: { userId_resellerId: { userId: user.id, resellerId } },
  });
  return !!link;
}
