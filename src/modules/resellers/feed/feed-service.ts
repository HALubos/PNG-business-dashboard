import { prisma } from "@/lib/prisma";
import { parseResellerFeed } from "./feed-parser";
import type { FeedConfig } from "./formats";

export interface ResellerFeedReport {
  resellerId: string;
  ok: boolean;
  items: number;
  withAvailability: number; // položky se známým stavem dostupnosti
  refreshedAt: Date | null;
  warnings: string[];
  error?: string;
}

const CHUNK = 2000;

function fail(
  resellerId: string,
  error: string,
  warnings: string[] = [],
): ResellerFeedReport {
  return {
    resellerId,
    ok: false,
    items: 0,
    withAvailability: 0,
    refreshedAt: null,
    warnings,
    error,
  };
}

/**
 * Stáhne feed odběratele, naparsuje zvoleným formátem a PŘEPÍŠE jeho ResellerFeedItem.
 * Chyba feedu NIKDY neházej ven (jeden vadný feed nesmí shodit nic kolem) — vrať ok:false.
 */
export async function refreshResellerFeed(
  resellerId: string,
  userId?: string,
): Promise<ResellerFeedReport> {
  const reseller = await prisma.reseller.findUnique({
    where: { id: resellerId },
    select: { id: true, feedUrl: true, feedFormat: true, feedConfig: true },
  });
  if (!reseller) return fail(resellerId, "Odběratel nenalezen.");
  if (!reseller.feedUrl) {
    return fail(resellerId, "Odběratel nemá nastavený feed URL.");
  }

  const warnings: string[] = [];
  try {
    const res = await fetch(reseller.feedUrl, { cache: "no-store" });
    if (!res.ok) return fail(resellerId, `Feed vrátil HTTP ${res.status}.`);
    const xml = await res.text();

    const parsed = parseResellerFeed(
      xml,
      reseller.feedFormat,
      (reseller.feedConfig as FeedConfig | null) ?? null,
    );
    warnings.push(...parsed.warnings);
    if (parsed.items.length === 0) {
      // Prázdný feed nepřepisuje stávající data naslepo.
      return fail(resellerId, "Feed neobsahuje žádné použitelné položky.", warnings);
    }

    // Přepiš položky daného odběratele (delete + recreate).
    await prisma.resellerFeedItem.deleteMany({ where: { resellerId } });
    for (let i = 0; i < parsed.items.length; i += CHUNK) {
      await prisma.resellerFeedItem.createMany({
        data: parsed.items.slice(i, i + CHUNK).map((it) => ({
          resellerId,
          ean: it.ean,
          stock: it.stock,
          availability: it.availability,
        })),
        skipDuplicates: true,
      });
    }

    const refreshedAt = new Date();
    const withAvailability = parsed.items.filter(
      (i) => i.availability !== null || (i.stock ?? 0) > 0,
    ).length;

    await prisma.reseller.update({
      where: { id: resellerId },
      data: { feedRefreshedAt: refreshedAt, feedItems: parsed.items.length },
    });
    await prisma.auditLog.create({
      data: {
        userId: userId ?? null,
        akce: "resellers.feed",
        entita: `Reseller:${resellerId}`,
        detail: { items: parsed.items.length, withAvailability },
      },
    });

    return {
      resellerId,
      ok: true,
      items: parsed.items.length,
      withAvailability,
      refreshedAt,
      warnings,
    };
  } catch (e) {
    return fail(
      resellerId,
      e instanceof Error ? e.message : "Aktualizace feedu selhala.",
      warnings,
    );
  }
}
