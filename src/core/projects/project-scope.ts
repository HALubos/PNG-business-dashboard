import { prisma } from "@/lib/prisma";
import { can, type AuthUser } from "@/core/rbac/access";

// ─────────────────────────────────────────────────────────────
// Sdílený rozsah projektů (značek) dle RBAC. Vzor je záměrně totožný s
// `src/modules/stock/reseller-scope.ts` (anti-drift) — parametrizováno klíčem
// „viewall" práva (`<modul>.viewall`).
//
// Marketing je INTERNÍ → dnes nemá uživatel projektovou vazbu, takže i bez
// `viewall` vidí všechny projekty. Větvení je tu ale připravené: až přibude
// vazba uživatel↔projekt (analogie `RepCustomer`), omezí se zde větev bez práva.
// ─────────────────────────────────────────────────────────────

export interface ProjectRef {
  id: string;
  klic: string;
  nazev: string;
}

/** Projekty, které uživatel smí vidět. */
export async function getVisibleProjects(
  user: AuthUser,
  viewallPermission: string,
): Promise<ProjectRef[]> {
  // Vzor: s `viewall` všechny projekty; bez něj (až bude scope) jen přiřazené.
  // Dnes nemá uživatel projektovou vazbu → obě větve vrací vše.
  const _vsechny = can(user, viewallPermission);
  void _vsechny;
  return prisma.project.findMany({
    orderBy: { nazev: "asc" },
    select: { id: true, klic: true, nazev: true },
  });
}

/** Smí uživatel vidět daný projekt? Vynuceno na backendu. */
export async function canViewProject(
  user: AuthUser,
  projectId: string,
  viewallPermission: string,
): Promise<boolean> {
  // S `viewall` (nebo dokud není per-uživatel scope) vidí jakýkoli existující projekt.
  const _vsechny = can(user, viewallPermission);
  void _vsechny;
  const p = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true },
  });
  return !!p;
}
