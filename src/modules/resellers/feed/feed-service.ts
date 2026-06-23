import { prisma } from "@/lib/prisma";
import { streamFeedBlocks } from "./feed-stream";
import { getFeedFormat, type FeedConfig, type NormalizedFeedItem } from "./formats";

export interface ResellerFeedResult {
  scanned: number; // kolik položek feed obsahoval
  items: number; // kolik se uložilo (= shoda s naším sortimentem)
  warnings: string[];
}

const CHUNK = 2000;

/** EANy našeho sortimentu (napříč produkty) — feed se filtruje jen na ně. */
async function loadOurEans(): Promise<Set<string>> {
  const rows = await prisma.product.findMany({
    distinct: ["ean"],
    select: { ean: true },
  });
  return new Set(rows.map((r) => r.ean));
}

/**
 * Stáhne a PROUDOVĚ zpracuje feed odběratele: vytáhne {ean, stock, availability}
 * jen pro EANy z našeho sortimentu a přepíše ResellerFeedItem. Konstantní paměť.
 * Hází jen tvrdé chyby (URL/HTTP/0 položek) — volá se z jobu na pozadí.
 */
export async function processResellerFeed(
  resellerId: string,
): Promise<ResellerFeedResult> {
  const reseller = await prisma.reseller.findUnique({
    where: { id: resellerId },
    select: { id: true, feedUrl: true, feedFormat: true, feedConfig: true },
  });
  if (!reseller) throw new Error("Odběratel nenalezen.");
  if (!reseller.feedUrl) throw new Error("Odběratel nemá nastavený feed URL.");

  const fmt = getFeedFormat(reseller.feedFormat);
  const config = (reseller.feedConfig as FeedConfig | null) ?? null;
  const ourEans = await loadOurEans();
  const warnings: string[] = [];

  // Streamuj feed → extrahuj položku → filtruj na naše EANy (dedup, první vyhrává).
  const matched = new Map<string, NormalizedFeedItem>();
  let scanned = 0;
  for await (const block of streamFeedBlocks(reseller.feedUrl, fmt.itemTag(config))) {
    scanned++;
    const it = fmt.extractItem(block, config);
    if (!it || !it.ean) continue;
    if (!ourEans.has(it.ean)) continue;
    if (!matched.has(it.ean)) matched.set(it.ean, it);
  }

  if (scanned === 0) {
    // Žádné položky = nejspíš špatný formát/URL → nepřepisuj stávající data.
    throw new Error(
      "Ve feedu nebyly nalezeny žádné položky — zkontrolujte formát a URL.",
    );
  }

  const items = [...matched.values()];
  if (items.length === 0) {
    warnings.push(
      `Z ${scanned} položek feedu se žádná neshoduje s naším sortimentem.`,
    );
  }

  // Přepiš položky daného odběratele.
  await prisma.resellerFeedItem.deleteMany({ where: { resellerId } });
  for (let i = 0; i < items.length; i += CHUNK) {
    await prisma.resellerFeedItem.createMany({
      data: items.slice(i, i + CHUNK).map((it) => ({
        resellerId,
        ean: it.ean,
        stock: it.stock,
        availability: it.availability,
      })),
      skipDuplicates: true,
    });
  }

  return { scanned, items: items.length, warnings };
}

/**
 * Job na POZADÍ: zpracuje feed a nastaví stav na odběrateli. NIKDY nehází ven
 * (volá se detached přes `void runResellerFeedJob(...)`).
 */
export async function runResellerFeedJob(
  resellerId: string,
  userId?: string,
): Promise<void> {
  try {
    const r = await processResellerFeed(resellerId);
    await prisma.reseller.update({
      where: { id: resellerId },
      data: {
        feedStatus: "ok",
        feedError: null,
        feedRefreshedAt: new Date(),
        feedItems: r.items,
      },
    });
    await prisma.auditLog.create({
      data: {
        userId: userId ?? null,
        akce: "resellers.feed",
        entita: `Reseller:${resellerId}`,
        detail: { scanned: r.scanned, items: r.items, warnings: r.warnings },
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Zpracování feedu selhalo.";
    await prisma.reseller
      .update({
        where: { id: resellerId },
        data: { feedStatus: "error", feedError: msg },
      })
      .catch(() => {});
  }
}
