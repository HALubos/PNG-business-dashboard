import { prisma } from "@/lib/prisma";
import { type AuthUser } from "@/core/rbac/access";
import { DEFAULT_AVAILABLE_STATES } from "./constants";
import {
  classifyProduct,
  createStockResolver,
  isRestockCandidate,
  resellerHasStock,
  type OpportunityCategory,
  type StockSource,
} from "./rules";
import {
  getVisibleResellers,
  canViewReseller as canViewResellerScoped,
} from "./reseller-scope";

// Rozsah dat modulu stock je vázaný na právo „stock.viewall".
const STOCK_VIEWALL = "stock.viewall";

// Re-export kvůli zpětné kompatibilitě (pravidlo a typy vlastní rules.ts).
export type { OpportunityCategory, StockSource } from "./rules";

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
  return getVisibleResellers(user, STOCK_VIEWALL);
}

/** Smí uživatel vidět daného odběratele? Vynuceno na backendu. */
export async function canViewReseller(
  user: AuthUser,
  resellerId: string,
): Promise<boolean> {
  return canViewResellerScoped(user, resellerId, STOCK_VIEWALL);
}

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

  // Sdílené pravidlo: efektivní sklad (feed → fallback) a kategorizace.
  const resolver = await createStockResolver(
    rows.map((r) => r.product.ean),
    config,
  );

  const buckets: ResellerProductBuckets = {
    opportunities: [],
    resellerHas: [],
    weOut: [],
  };

  for (const r of rows) {
    const eff = resolver.resolve(r.product.ean, r.product.ourStock);
    const ruleArgs = {
      availability: r.availability,
      effectiveStock: eff.stock,
    };
    const category = classifyProduct(ruleArgs, config);

    const row: Opportunity = {
      productId: r.productId,
      ean: r.product.ean,
      nazev: r.product.nazev,
      size: r.product.size,
      producer: r.product.producer,
      kategorie: r.product.kategorie,
      ourStock: eff.stock,
      stock7d: eff.stock7d,
      stockSource: eff.source,
      salePrice: numOrNull(r.product.salePrice),
      price: numOrNull(r.product.price),
      resellerStock: r.stock,
      availability: r.availability,
      resellerCena: numOrNull(r.cena),
      category,
      resellerHas: resellerHasStock(r.availability, config),
      isRestockCandidate: isRestockCandidate(ruleArgs, config),
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
