"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/core/auth/session";
import { can } from "@/core/rbac/access";
import { prisma } from "@/lib/prisma";
import { parsePriceCheck } from "@/modules/stock/import/parser";
import {
  importSnapshot,
  type ImportReport,
} from "@/modules/stock/import/import-service";
import { refreshOurStock } from "@/modules/stock/feed/feed-service";
import { KNOWN_AVAILABILITY_STATES } from "@/modules/stock/constants";

export interface ImportActionState {
  ok?: boolean;
  error?: string;
  report?: ImportReport;
}

export async function importAction(
  _prev: ImportActionState,
  formData: FormData,
): Promise<ImportActionState> {
  const user = await getCurrentUser();
  // Import vyžaduje právo na úpravy (stock.edit) — vynuceno na backendu.
  if (!user || !can(user, "stock.edit")) {
    return { error: "Nemáte oprávnění importovat data." };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Vyberte soubor XLSX." };
  }
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    return { error: "Soubor musí být ve formátu .xlsx." };
  }

  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const parsed = await parsePriceCheck(buf);
    if (parsed.products.length === 0) {
      return { error: "V souboru nebyly nalezeny žádné produkty s EAN." };
    }
    const report = await importSnapshot(parsed, {
      nazevSouboru: file.name,
      userId: user.id,
    });
    revalidatePath("/skladovost");
    return { ok: true, report };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Import se nezdařil.",
    };
  }
}

export interface ConfigActionState {
  ok?: boolean;
  error?: string;
}

export async function updateConfigAction(
  _prev: ConfigActionState,
  formData: FormData,
): Promise<ConfigActionState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "stock.admin")) {
    return { error: "Nemáte oprávnění měnit nastavení modulu." };
  }

  const states = formData
    .getAll("availableStates")
    .map(String)
    .filter((s) => KNOWN_AVAILABILITY_STATES.includes(s));

  const thresholdRaw = Number(formData.get("stockThreshold"));
  const stockThreshold =
    Number.isFinite(thresholdRaw) && thresholdRaw >= 0
      ? Math.floor(thresholdRaw)
      : 0;

  await prisma.stockConfig.upsert({
    where: { id: 1 },
    update: { availableStates: states, stockThreshold },
    create: { id: 1, availableStates: states, stockThreshold },
  });
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      akce: "stock.config",
      entita: "StockConfig",
      detail: { availableStates: states, stockThreshold },
    },
  });

  revalidatePath("/skladovost");
  return { ok: true };
}

export interface FeedActionState {
  ok?: boolean;
  error?: string;
  items?: number;
  inStock?: number;
}

export async function refreshStockAction(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- useActionState předává předchozí stav
  _prev: FeedActionState,
): Promise<FeedActionState> {
  const user = await getCurrentUser();
  // Aktualizace skladovosti vyžaduje právo na úpravy dat.
  if (!user || !can(user, "stock.edit")) {
    return { error: "Nemáte oprávnění aktualizovat skladovost." };
  }
  try {
    const report = await refreshOurStock(user.id);
    revalidatePath("/skladovost");
    return { ok: true, items: report.items, inStock: report.inStock };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Aktualizace skladu selhala.",
    };
  }
}
