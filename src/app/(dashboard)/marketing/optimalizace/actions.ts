"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/core/auth/session";
import { can } from "@/core/rbac/access";
import { prisma } from "@/lib/prisma";
import { canViewProject } from "@/core/projects/project-scope";
import { refreshCatalog } from "@/modules/mkt_bidding/catalog";
import { MKT_BIDDING_VIEWALL } from "@/modules/mkt_bidding/data";

export interface BiddingActionState {
  ok?: boolean;
  error?: string;
  info?: string;
}

/**
 * Obnoví katalog produktů (cena/kategorie/dostupnost) z XML feedu srovnávače.
 * Právo `mkt_bidding.edit`. Běží awaited (feed je proudově parsovaný, ~MB).
 */
export async function refreshCatalogAction(
  _prev: BiddingActionState,
  formData: FormData,
): Promise<BiddingActionState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "mkt_bidding.edit")) {
    return { error: "Nemáte oprávnění obnovit katalog." };
  }
  const projectId = String(formData.get("projectId") ?? "");
  if (!(await canViewProject(user, projectId, MKT_BIDDING_VIEWALL))) {
    return { error: "K tomuto projektu nemáte přístup." };
  }
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { klic: true },
  });
  if (!project) return { error: "Projekt nenalezen." };

  try {
    const res = await refreshCatalog(projectId, project.klic);
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        akce: "bidding.catalog_refresh",
        entita: `Project:${projectId}`,
        detail: { items: res.items, skipped: res.skipped },
      },
    });
    revalidatePath("/marketing/optimalizace");
    return { ok: true, info: `Katalog načten: ${res.items} produktů.` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Načtení katalogu selhalo." };
  }
}
