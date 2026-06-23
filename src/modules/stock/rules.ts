import { prisma } from "@/lib/prisma";

// ─────────────────────────────────────────────────────────────
// Sdílená rozhodovací pravidla modulu skladovosti (§5.4 zadání).
// JEDINÝ zdroj pravdy pro modul `stock` i `analytics` (anti-drift).
// ─────────────────────────────────────────────────────────────

// Kategorie produktu u odběratele (kvadranty „máme my" × „má odběratel"):
//  - opportunity:  máme skladem, odběratel nemá dostupné  → nabídnout
//  - reseller_has: máme skladem, odběratel má dostupné     → kontext „už veze"
//  - we_out:       my vyprodáno (≤ práh)                   → my to teď nedodáme
export type OpportunityCategory = "opportunity" | "reseller_has" | "we_out";

// Odkud pochází náš sklad: feed = živý XML feed, none = ve feedu chybí (→ 0),
// xlsx = feed ještě neproběhl, použit sloupec Stock z Price Checku (pojistka).
export type StockSource = "feed" | "none" | "xlsx";

// Minimální konfigurace pro pravidlo (StockSettings ji strukturálně splňuje).
export interface StockRuleConfig {
  availableStates: string[];
  stockThreshold: number;
}

export interface EffectiveStock {
  stock: number;
  stock7d: number | null;
  source: StockSource;
}

// ── Pure pravidla ────────────────────────────────────────────

/** Má odběratel produkt jako dostupný (availability ∈ availableStates)? */
export function resellerHasStock(
  availability: string | null,
  config: StockRuleConfig,
): boolean {
  return availability ? config.availableStates.includes(availability) : false;
}

/** Máme produkt my skladem (efektivní sklad > práh)? */
export function weHaveStock(
  effectiveStock: number,
  config: StockRuleConfig,
): boolean {
  return effectiveStock > config.stockThreshold;
}

/** Kategorie produktu u odběratele dle §5.4. */
export function classifyProduct(
  args: { availability: string | null; effectiveStock: number },
  config: StockRuleConfig,
): OpportunityCategory {
  if (!weHaveStock(args.effectiveStock, config)) return "we_out";
  if (resellerHasStock(args.availability, config)) return "reseller_has";
  return "opportunity";
}

/** Vyprodáno u nás I u odběratele → příležitost po naskladnění. */
export function isRestockCandidate(
  args: { availability: string | null; effectiveStock: number },
  config: StockRuleConfig,
): boolean {
  return (
    !weHaveStock(args.effectiveStock, config) &&
    !resellerHasStock(args.availability, config)
  );
}

// ── Efektivní sklad (feed → fallback) ────────────────────────

/**
 * Efektivní náš sklad pro jeden EAN:
 *  - bez feedu (pojistka) → Product.ourStock (XLSX)
 *  - s feedem a nálezem   → hodnota z feedu
 *  - s feedem bez nálezu  → 0 (ve feedu chybí = nemáme)
 */
export function effectiveStockFor(
  productOurStock: number,
  live: { stock: number; stock7d: number } | undefined,
  feedReady: boolean,
): EffectiveStock {
  if (!feedReady) {
    return { stock: productOurStock, stock7d: null, source: "xlsx" };
  }
  if (live) {
    return { stock: live.stock, stock7d: live.stock7d, source: "feed" };
  }
  return { stock: 0, stock7d: null, source: "none" };
}

export interface StockResolver {
  feedReady: boolean;
  resolve(ean: string, productOurStock: number): EffectiveStock;
}

/**
 * Načte živý sklad z OurStockItem pro dané EANy (jen když feed už proběhl) a vrátí
 * resolver, který pro (ean, fallback) spočítá efektivní sklad. Sdílí stock i analytics.
 */
export async function createStockResolver(
  eans: string[],
  config: { feedRefreshedAt: Date | null },
): Promise<StockResolver> {
  const feedReady = config.feedRefreshedAt != null;
  const map = new Map<string, { stock: number; stock7d: number }>();
  if (feedReady) {
    const live = await prisma.ourStockItem.findMany({
      where: { ean: { in: [...new Set(eans)] } },
      select: { ean: true, stock: true, stock7d: true },
    });
    for (const it of live) {
      map.set(it.ean, { stock: it.stock, stock7d: it.stock7d });
    }
  }
  return {
    feedReady,
    resolve: (ean, productOurStock) =>
      effectiveStockFor(productOurStock, map.get(ean), feedReady),
  };
}

// ── Efektivní dostupnost ODBĚRATELE (feed odběratele → fallback Price Check) ──

// Odkud pochází dostupnost u odběratele: feed = jeho XML feed, pricecheck = Price Check.
export type AvailabilitySource = "feed" | "pricecheck";

export interface EffectiveAvailability {
  availability: string | null; // textový stav v našem vokabuláři
  stock: number | null; // ks z feedu (když je)
  source: AvailabilitySource;
}

/**
 * Efektivní dostupnost produktu u odběratele:
 *  - feed odběratele je ready A daný EAN je ve feedu → z feedu (text; chybí-li, odvoď z ks),
 *  - jinak → z Price Checku (fallback).
 */
export function effectiveAvailabilityFor(
  priceCheckAvailability: string | null,
  feedItem: { stock: number | null; availability: string | null } | undefined,
  feedReady: boolean,
): EffectiveAvailability {
  if (feedReady && feedItem) {
    // Chybí-li textový stav, odvoď z ks: >0 skladem · =0 vyprodáno · null neuvedeno.
    const availability =
      feedItem.availability ??
      (feedItem.stock === null
        ? null
        : feedItem.stock > 0
          ? "skladem"
          : "vyprodáno");
    return { availability, stock: feedItem.stock, source: "feed" };
  }
  return { availability: priceCheckAvailability, stock: null, source: "pricecheck" };
}

export interface ResellerAvailabilityResolver {
  feedReady: boolean;
  resolve(ean: string, priceCheckAvailability: string | null): EffectiveAvailability;
}

/**
 * Resolver efektivní dostupnosti pro JEDNOHO odběratele (analogicky k createStockResolver).
 * feedReady = odběratel má feedUrl A proběhla aktualizace (feedRefreshedAt != null).
 * Když ready, načte ResellerFeedItem pro dané EANy; jinak vždy fallback na Price Check.
 */
export async function createResellerAvailabilityResolver(
  reseller: { id: string; feedUrl: string | null; feedRefreshedAt: Date | null },
  eans: string[],
): Promise<ResellerAvailabilityResolver> {
  const feedReady = !!reseller.feedUrl && reseller.feedRefreshedAt != null;
  const map = new Map<string, { stock: number | null; availability: string | null }>();
  if (feedReady) {
    const items = await prisma.resellerFeedItem.findMany({
      where: { resellerId: reseller.id, ean: { in: [...new Set(eans)] } },
      select: { ean: true, stock: true, availability: true },
    });
    for (const it of items) {
      map.set(it.ean, { stock: it.stock, availability: it.availability });
    }
  }
  return {
    feedReady,
    resolve: (ean, priceCheckAvailability) =>
      effectiveAvailabilityFor(priceCheckAvailability, map.get(ean), feedReady),
  };
}
