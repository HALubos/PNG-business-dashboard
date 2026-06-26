import { prisma } from "@/lib/prisma";
import { streamFeedBlocks } from "@/modules/resellers/feed/feed-stream";
import { loadMargins } from "./margins";
import {
  loadCategoryOverrides,
  mapToInternalCategory,
} from "./category-map";

// ─────────────────────────────────────────────────────────────
// Katalogový XML feed Heureky (cena, kategorie, dostupnost) → `ProductCatalogItem`.
// Parsuje se PROUDOVĚ (vzor feed-stream.ts) ze `Connector.feedUrl`. Tagy v <SHOPITEM>:
// ITEM_ID, PRODUCTNAME, PRICE_VAT, CATEGORYTEXT (Heureka.cz | … | …), EAN, DELIVERY_DATE.
// Feed deklaruje windows-1250, ale je reálně UTF-8 → TextDecoder (default utf-8) sedí.
//
// Dostupnost: primárně z NAŠEHO skladu (OurStockItem dle EANu, ks>0), fallback
// DELIVERY_DATE feedu. Interní kategorie se mapuje z CATEGORYTEXT (margins + override).
// ─────────────────────────────────────────────────────────────

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Obsah tagu z bloku (ošetří atributy i CDATA). */
function tag(block: string, name: string): string | null {
  const re = new RegExp(
    `<${escapeRe(name)}\\b[^>]*>([\\s\\S]*?)</${escapeRe(name)}>`,
    "i",
  );
  const m = re.exec(block);
  if (!m) return null;
  let v = m[1].trim();
  const cdata = /^<!\[CDATA\[([\s\S]*?)\]\]>$/.exec(v);
  if (cdata) v = cdata[1].trim();
  return v || null;
}

function toNum(v: string | null): number | null {
  if (v === null) return null;
  const n = Number(v.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export interface CatalogRefreshResult {
  items: number;
  skipped: number;
}

/**
 * Stáhne a uloží katalog produktů Heureka pro projekt. Vrací počet uložených položek.
 * Hází na chybě (chybí feed URL / HTTP / feed bez položek).
 */
export async function refreshCatalog(
  projectId: string,
  projectKlic: string,
): Promise<CatalogRefreshResult> {
  const connector = await prisma.connector.findUnique({
    where: { projectId_type: { projectId, type: "heureka" } },
    select: { feedUrl: true },
  });
  if (!connector?.feedUrl) {
    throw new Error(
      "Heureka konektor nemá URL katalogového feedu — doplňte ji v Integraci.",
    );
  }

  // Podklady pro mapování kategorií + náš sklad (dostupnost dle EANu).
  const margins = await loadMargins(projectKlic);
  const overrides = await loadCategoryOverrides();
  const known = new Map<string, string>();
  for (const [low, m] of margins.byCategory) known.set(low, m.category);

  const stockRows = await prisma.ourStockItem.findMany({
    select: { ean: true, stock: true },
  });
  const ourStock = new Map<string, number>();
  for (const s of stockRows) ourStock.set(s.ean, s.stock);

  const startedAt = new Date();
  let count = 0;
  let skipped = 0;
  let sawBlock = false;

  for await (const block of streamFeedBlocks(connector.feedUrl, "SHOPITEM")) {
    sawBlock = true;
    const itemId = tag(block, "ITEM_ID");
    if (!itemId) {
      skipped++;
      continue;
    }
    const ean = tag(block, "EAN");
    const name = tag(block, "PRODUCTNAME") ?? tag(block, "PRODUCT");
    const priceVat = toNum(tag(block, "PRICE_VAT"));
    const categoryText = tag(block, "CATEGORYTEXT");
    const deliveryDays = toNum(tag(block, "DELIVERY_DATE"));
    const internalCategory = mapToInternalCategory(categoryText, known, overrides);

    // Dostupnost: náš sklad (EAN) má přednost, jinak DELIVERY_DATE.
    let available: boolean;
    if (ean && ourStock.has(ean)) {
      available = (ourStock.get(ean) ?? 0) > 0;
    } else if (deliveryDays != null) {
      available = deliveryDays <= 14;
    } else {
      available = true; // neznámé → nevylučujeme
    }

    await prisma.productCatalogItem.upsert({
      where: { projectId_itemId: { projectId, itemId } },
      update: {
        ean,
        name,
        priceVat,
        categoryText,
        internalCategory,
        available,
        deliveryDays: deliveryDays != null ? Math.trunc(deliveryDays) : null,
        refreshedAt: startedAt,
      },
      create: {
        projectId,
        itemId,
        ean,
        name,
        priceVat,
        categoryText,
        internalCategory,
        available,
        deliveryDays: deliveryDays != null ? Math.trunc(deliveryDays) : null,
        refreshedAt: startedAt,
      },
    });
    count++;
  }

  if (!sawBlock) {
    throw new Error(
      "Katalogový feed neobsahuje žádné <SHOPITEM> — zkontrolujte URL a formát.",
    );
  }

  // Úklid položek, které ve feedu už nejsou (starší refresh).
  await prisma.productCatalogItem.deleteMany({
    where: { projectId, refreshedAt: { lt: startedAt } },
  });

  return { items: count, skipped };
}
