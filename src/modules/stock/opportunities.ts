import { prisma } from "@/lib/prisma";
import { can, type AuthUser } from "@/core/rbac/access";
import { DEFAULT_AVAILABLE_STATES } from "./constants";

// Decimal → number | null
function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v as number);
  return Number.isFinite(n) ? n : null;
}

export interface StockSettings {
  availableStates: string[];
  stockThreshold: number;
  feedRefreshedAt: Date | null; // poslední aktualizace skladu z feedu
  feedItems: number | null; // počet položek v posledním feedu
}

export async function getStockConfig(): Promise<StockSettings> {
  const c = await prisma.stockConfig.findUnique({ where: { id: 1 } });
  return {
    availableStates: c?.availableStates ?? DEFAULT_AVAILABLE_STATES,
    stockThreshold: c?.stockThreshold ?? 0,
    feedRefreshedAt: c?.feedRefreshedAt ?? null,
    feedItems: c?.feedItems ?? null,
  };
}

export async function getActiveSnapshot() {
  return prisma.importSnapshot.findFirst({
    where: { aktivni: true },
    orderBy: { nahranoKdy: "desc" },
    include: { nahral: { select: { jmeno: true } } },
  });
}

export interface ResellerOption {
  id: string;
  domena: string;
  nazev: string | null;
}

/** Odběratelé, které uživatel smí vidět (bez vlastních e-shopů). Respektuje RBAC. */
export async function listResellersForUser(
  user: AuthUser,
): Promise<ResellerOption[]> {
  const base = { jeVlastni: false } as const;
  const where = can(user, "stock.viewall")
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
): Promise<boolean> {
  if (can(user, "stock.viewall")) {
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

// Kategorie produktu u odběratele (kvadranty „máme my" × „má odběratel"):
//  - opportunity:  máme skladem, odběratel nemá dostupné  → nabídnout (§5.4)
//  - reseller_has: máme skladem, odběratel má dostupné     → kontext „už veze"
//  - we_out:       my vyprodáno (≤ práh)                   → my to teď nedodáme
export type OpportunityCategory = "opportunity" | "reseller_has" | "we_out";

// Odkud pochází náš sklad: feed = živý XML feed, none = ve feedu chybí (→ 0),
// xlsx = feed ještě neproběhl, použit sloupec Stock z Price Checku (pojistka).
export type StockSource = "feed" | "none" | "xlsx";

export interface Opportunity {
  productId: string;
  ean: string;
  nazev: string;
  size: string | null;
  producer: string | null;
  kategorie: string | null;
  ourStock: number; // efektivní sklad (z feedu, příp. fallback)
  stock7d: number | null; // příjem do 7 dnů (z feedu)
  stockSource: StockSource;
  salePrice: number | null;
  price: number | null;
  resellerStock: number | null;
  availability: string | null;
  resellerCena: number | null;
  category: OpportunityCategory;
  /** Má odběratel produkt jako dostupný (availability ∈ availableStates)? */
  resellerHas: boolean;
  /** Vyprodáno u nás I u odběratele → příležitost po naskladnění. */
  isRestockCandidate: boolean;
}

export interface ResellerProductBuckets {
  opportunities: Opportunity[]; // máme my, odběratel nemá  (akční seznam + export)
  resellerHas: Opportunity[]; // máme my, odběratel už má
  weOut: Opportunity[]; // my vyprodáno (vč. restock kandidátů)
}

/**
 * Načte všechny produkty, které odběratel v aktivním snapshotu listuje, a rozdělí
 * je do tří bloků. Jediný zdroj pravdy pro stránku i export.
 */
export async function categorizeResellerProducts(
  snapshotId: string,
  resellerId: string,
  config: StockSettings,
): Promise<ResellerProductBuckets> {
  const rows = await prisma.resellerProductAvailability.findMany({
    where: { snapshotId, resellerId },
    include: { product: true },
    orderBy: [{ product: { producer: "asc" } }, { product: { nazev: "asc" } }],
  });

  // Živý sklad z feedu (dle EANu). Pojistka: dokud feed nikdy neproběhl,
  // bereme sklad z XLSX, ať modul není prázdný.
  const feedReady = config.feedRefreshedAt != null;
  const stockMap = new Map<string, { stock: number; stock7d: number }>();
  if (feedReady) {
    const eans = [...new Set(rows.map((r) => r.product.ean))];
    const live = await prisma.ourStockItem.findMany({
      where: { ean: { in: eans } },
      select: { ean: true, stock: true, stock7d: true },
    });
    for (const it of live) stockMap.set(it.ean, { stock: it.stock, stock7d: it.stock7d });
  }

  const buckets: ResellerProductBuckets = {
    opportunities: [],
    resellerHas: [],
    weOut: [],
  };

  for (const r of rows) {
    const live = stockMap.get(r.product.ean);
    // Feed je zdroj pravdy: ve feedu chybí → 0. Bez feedu (pojistka) → XLSX Stock.
    const effectiveStock = feedReady
      ? (live?.stock ?? 0)
      : r.product.ourStock;
    const stock7d = live ? live.stock7d : null;
    const stockSource: StockSource = feedReady
      ? live
        ? "feed"
        : "none"
      : "xlsx";

    const ourInStock = effectiveStock > config.stockThreshold;
    const resellerHas = r.availability
      ? config.availableStates.includes(r.availability)
      : false;

    let category: OpportunityCategory;
    if (!ourInStock) category = "we_out";
    else if (resellerHas) category = "reseller_has";
    else category = "opportunity";

    const row: Opportunity = {
      productId: r.productId,
      ean: r.product.ean,
      nazev: r.product.nazev,
      size: r.product.size,
      producer: r.product.producer,
      kategorie: r.product.kategorie,
      ourStock: effectiveStock,
      stock7d,
      stockSource,
      salePrice: numOrNull(r.product.salePrice),
      price: numOrNull(r.product.price),
      resellerStock: r.stock,
      availability: r.availability,
      resellerCena: numOrNull(r.cena),
      category,
      resellerHas,
      isRestockCandidate: !ourInStock && !resellerHas,
    };

    if (category === "opportunity") buckets.opportunities.push(row);
    else if (category === "reseller_has") buckets.resellerHas.push(row);
    else buckets.weOut.push(row);
  }

  return buckets;
}

/** Jen příležitosti (§5.4) — pro export a místa, kde stačí akční seznam. */
export async function computeOpportunities(
  snapshotId: string,
  resellerId: string,
  config: StockSettings,
): Promise<Opportunity[]> {
  const { opportunities } = await categorizeResellerProducts(
    snapshotId,
    resellerId,
    config,
  );
  return opportunities;
}
