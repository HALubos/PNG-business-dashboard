import { prisma } from "@/lib/prisma";
import { parseStockFeed } from "./feed-parser";

export interface FeedRefreshReport {
  items: number; // počet položek uložených z feedu
  inStock: number; // z toho skladem (>0)
  refreshedAt: Date;
  warnings: string[];
}

const CHUNK = 2000;

/**
 * Stáhne XML feed (STOCK_FEED_URL), naparsuje a přepíše tabulku OurStockItem.
 * Feed = zdroj pravdy o naší skladovosti (globálně dle EANu).
 */
export async function refreshOurStock(
  userId?: string,
): Promise<FeedRefreshReport> {
  const url = process.env.STOCK_FEED_URL;
  if (!url) {
    throw new Error("Není nastavena proměnná STOCK_FEED_URL (.env.local).");
  }

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Feed vrátil HTTP ${res.status}.`);
  }
  const xml = await res.text();
  const { items, warnings } = parseStockFeed(xml);
  if (items.length === 0) {
    throw new Error(
      "Feed neobsahuje žádné použitelné položky — skladovost nebyla změněna.",
    );
  }

  // Přepíšeme celou tabulku (feed je kompletní snímek našeho skladu).
  await prisma.ourStockItem.deleteMany({});
  for (let i = 0; i < items.length; i += CHUNK) {
    await prisma.ourStockItem.createMany({
      data: items.slice(i, i + CHUNK).map((it) => ({
        ean: it.ean,
        stock: it.stock,
        stock7d: it.stock7d,
      })),
      skipDuplicates: true,
    });
  }

  const refreshedAt = new Date();
  const inStock = items.filter((i) => i.stock > 0).length;

  await prisma.stockConfig.upsert({
    where: { id: 1 },
    update: { feedRefreshedAt: refreshedAt, feedItems: items.length },
    create: {
      id: 1,
      feedRefreshedAt: refreshedAt,
      feedItems: items.length,
    },
  });
  await prisma.auditLog.create({
    data: {
      userId: userId ?? null,
      akce: "stock.feed",
      entita: "OurStockItem",
      detail: { items: items.length, inStock },
    },
  });

  return { items: items.length, inStock, refreshedAt, warnings };
}
