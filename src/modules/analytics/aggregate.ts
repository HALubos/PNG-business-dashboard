import { prisma } from "@/lib/prisma";
import { type AuthUser } from "@/core/rbac/access";
import {
  classifyProduct,
  createStockResolver,
  effectiveAvailabilityFor,
} from "@/modules/stock/rules";
import { getActiveSnapshot, getStockConfig } from "@/modules/stock/opportunities";
import {
  getVisibleResellers,
  type ResellerRef,
} from "@/modules/stock/reseller-scope";

// Rozsah dat modulu analytics je vázaný na právo „analytics.viewall".
export const ANALYTICS_VIEWALL = "analytics.viewall";

// Decimal → number | null
function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v as number);
  return Number.isFinite(n) ? n : null;
}

/** Naše cena produktu pro účely hodnoty: salePrice, fallback price, jinak 0. */
function priceOf(p: { salePrice: unknown; price: unknown }): number {
  return numOrNull(p.salePrice) ?? numOrNull(p.price) ?? 0;
}

// ── Filtry (UI je nemusí dopočítávat) ───────────────────────
export interface AnalyticsFilters {
  producer?: string; // přesná značka
  kategorie?: string; // podřetězec kategorie (case-insensitive)
}

// ── Výstupní typy ───────────────────────────────────────────

// deltaCount = trend dle snapshotů (verzovaný sklad), null = předchozí snapshot není.
// POZOR: opportunityCount/resellerCount jsou „aktuální stav (živý sklad)",
// deltaCount je „trend dle snapshotů (verzovaný Product.ourStock)" — jiný zdroj dat.

/** A) Žebříček odběratelů — koho oslovit první. */
export interface ResellerRanking {
  resellerId: string;
  domena: string;
  nazev: string | null;
  opportunityCount: number; // počet příležitostí (živý sklad)
  opportunityValue: number; // Σ naší ceny přes produkty-příležitosti
  brandCount: number; // počet dotčených značek
  categoryCount: number; // počet dotčených kategorií
  deltaCount: number | null; // trend: verzovaný(aktivní) − verzovaný(předchozí)
}

/** B) Top produkty napříč trhem — co tlačit do nabídek. */
export interface ProductRanking {
  productId: string;
  ean: string;
  nazev: string;
  size: string | null;
  producer: string | null;
  kategorie: string | null;
  ourStock: number; // efektivní sklad (ks, živý feed)
  stock7d: number | null;
  resellerCount: number; // u kolika odběratelů je to příležitost (živý sklad)
  value: number; // počet odběratelů × naše cena
  domeny: string[]; // domény dotčených odběratelů (pro detail)
  deltaCount: number | null; // trend: verzovaný(aktivní) − verzovaný(předchozí), dle EANu
}

/** Trend mezi aktivním a předchozím snapshotem (z verzovaného skladu). */
export interface TrendSummary {
  previousSnapshotDate: Date;
  activeOpportunities: number; // verzovaný počet v aktivním snapshotu
  previousOpportunities: number; // verzovaný počet v předchozím snapshotu
  deltaOpportunities: number; // celkový posun (aktivní − předchozí)
}

/** C) Souhrn (KPI do hlavičky). */
export interface AnalyticsSummary {
  totalOpportunities: number; // celkem příležitostí (živý sklad)
  totalValue: number; // celková hodnota
  resellersWithOpportunities: number; // odběratelů s ≥1 příležitostí
  productsWithOpportunities: number; // dotčených produktů
  snapshotDate: Date | null; // datum aktivního snapshotu
  trend: TrendSummary | null; // null = předchozí snapshot neexistuje → skrýt trendy
}

export interface AnalyticsResult {
  summary: AnalyticsSummary;
  resellerLeaderboard: ResellerRanking[];
  topProducts: ProductRanking[];
}

function emptyResult(snapshotDate: Date | null): AnalyticsResult {
  return {
    summary: {
      totalOpportunities: 0,
      totalValue: 0,
      resellersWithOpportunities: 0,
      productsWithOpportunities: 0,
      snapshotDate,
      trend: null,
    },
    resellerLeaderboard: [],
    topProducts: [],
  };
}

// ── Trend: verzované počty příležitostí (Product.ourStock daného snapshotu) ──
interface VersionedCounts {
  byReseller: Map<string, number>;
  byEan: Map<string, number>;
  total: number;
}

type RpaWithProduct = {
  resellerId: string;
  availability: string | null;
  product: {
    ean: string;
    ourStock: number;
    producer: string | null;
    kategorie: string | null;
  };
};

/** Spočítá příležitosti z VERZOVANÉHO skladu (Product.ourStock) — pro férový trend. */
function countVersionedFromRows(
  rows: RpaWithProduct[],
  config: { availableStates: string[]; stockThreshold: number },
  filters: AnalyticsFilters,
): VersionedCounts {
  const byReseller = new Map<string, number>();
  const byEan = new Map<string, number>();
  let total = 0;
  const katF = filters.kategorie?.trim().toLowerCase();

  for (const r of rows) {
    const p = r.product;
    if (filters.producer && p.producer !== filters.producer) continue;
    if (katF && !(p.kategorie ?? "").toLowerCase().includes(katF)) continue;

    // Verzovaný sklad přímo ze snapshotu (NE živý feed).
    const category = classifyProduct(
      { availability: r.availability, effectiveStock: p.ourStock },
      config,
    );
    if (category !== "opportunity") continue;

    total++;
    byReseller.set(r.resellerId, (byReseller.get(r.resellerId) ?? 0) + 1);
    byEan.set(p.ean, (byEan.get(p.ean) ?? 0) + 1);
  }
  return { byReseller, byEan, total };
}

async function countVersionedForSnapshot(
  snapshotId: string,
  allowedIds: string[],
  config: { availableStates: string[]; stockThreshold: number },
  filters: AnalyticsFilters,
): Promise<VersionedCounts> {
  const rows = await prisma.resellerProductAvailability.findMany({
    where: { snapshotId, resellerId: { in: allowedIds } },
    include: {
      product: {
        select: { ean: true, ourStock: true, producer: true, kategorie: true },
      },
    },
  });
  return countVersionedFromRows(rows, config, filters);
}

/** Nejbližší starší snapshot dle datumExportu, druhotně dle nahranoKdy. */
async function findPreviousSnapshot(active: {
  id: string;
  datumExportu: Date;
  nahranoKdy: Date;
}) {
  return prisma.importSnapshot.findFirst({
    where: {
      id: { not: active.id },
      OR: [
        { datumExportu: { lt: active.datumExportu } },
        {
          datumExportu: active.datumExportu,
          nahranoKdy: { lt: active.nahranoKdy },
        },
      ],
    },
    orderBy: [{ datumExportu: "desc" }, { nahranoKdy: "desc" }],
    select: { id: true, datumExportu: true },
  });
}

/**
 * Agreguje příležitosti NAPŘÍČ zadanými (viditelnými) odběrateli nad aktivním
 * snapshotem pomocí SDÍLENÉHO pravidla (modul stock). Rozsah odběratelů je vstup
 * (RBAC řeší volající) → zástupce dostane čísla jen za své odběratele.
 *
 * Výkon: 2 dotazy (RPA aktivního snapshotu pro viditelné odběratele + sklad
 * z OurStockItem) a agregace v paměti. Žádné N+1.
 */
export async function aggregateOpportunities(opts: {
  visibleResellers: ResellerRef[];
  filters?: AnalyticsFilters;
}): Promise<AnalyticsResult> {
  const filters = opts.filters ?? {};
  const resellerMeta = new Map(opts.visibleResellers.map((r) => [r.id, r]));
  const allowedIds = [...resellerMeta.keys()];

  const snapshot = await getActiveSnapshot();
  if (!snapshot || allowedIds.length === 0) {
    return emptyResult(snapshot?.datumExportu ?? null);
  }
  const config = await getStockConfig();

  // 1) Řádky dostupností aktivního snapshotu jen pro viditelné odběratele + produkt.
  const rows = await prisma.resellerProductAvailability.findMany({
    where: { snapshotId: snapshot.id, resellerId: { in: allowedIds } },
    include: { product: true },
  });

  // 2) Efektivní sklad jedním dotazem (sdílený resolver z modulu stock).
  const resolver = await createStockResolver(
    rows.map((r) => r.product.ean),
    config,
  );

  // 3) Efektivní dostupnost per odběratel z jeho feedu (headline — živá data).
  //    (Trend níže zůstává na surovém Price Checku — feed se neverzuje.)
  const feedResellers = await prisma.reseller.findMany({
    where: { id: { in: allowedIds }, feedUrl: { not: null }, feedRefreshedAt: { not: null } },
    select: { id: true },
  });
  const readySet = new Set(feedResellers.map((r) => r.id));
  const feedKey = (resellerId: string, ean: string) => `${resellerId} ${ean}`;
  const feedMap = new Map<string, { stock: number | null; availability: string | null }>();
  if (readySet.size > 0) {
    const feedItems = await prisma.resellerFeedItem.findMany({
      where: { resellerId: { in: [...readySet] } },
      select: { resellerId: true, ean: true, stock: true, availability: true },
    });
    for (const it of feedItems) {
      feedMap.set(feedKey(it.resellerId, it.ean), {
        stock: it.stock,
        availability: it.availability,
      });
    }
  }

  // ── Agregace v paměti ──
  const resAcc = new Map<
    string,
    { count: number; value: number; brands: Set<string>; cats: Set<string> }
  >();
  type ProdAcc = {
    p: (typeof rows)[number]["product"];
    count: number;
    value: number;
    ourStock: number;
    stock7d: number | null;
    domeny: Set<string>;
  };
  const prodAcc = new Map<string, ProdAcc>();
  let totalOpportunities = 0;
  let totalValue = 0;

  const kategorieFilter = filters.kategorie?.trim().toLowerCase();

  for (const r of rows) {
    const p = r.product;

    // Filtry (UI je nemusí dopočítávat).
    if (filters.producer && p.producer !== filters.producer) continue;
    if (
      kategorieFilter &&
      !(p.kategorie ?? "").toLowerCase().includes(kategorieFilter)
    ) {
      continue;
    }

    const eff = resolver.resolve(p.ean, p.ourStock);
    const av = effectiveAvailabilityFor(
      r.availability,
      feedMap.get(feedKey(r.resellerId, p.ean)),
      readySet.has(r.resellerId),
    );
    const category = classifyProduct(
      { availability: av.availability, effectiveStock: eff.stock },
      config,
    );
    if (category !== "opportunity") continue;

    const price = priceOf(p);
    totalOpportunities++;
    totalValue += price;

    // A) odběratel
    let ra = resAcc.get(r.resellerId);
    if (!ra) {
      ra = { count: 0, value: 0, brands: new Set(), cats: new Set() };
      resAcc.set(r.resellerId, ra);
    }
    ra.count++;
    ra.value += price;
    if (p.producer) ra.brands.add(p.producer);
    if (p.kategorie) ra.cats.add(p.kategorie);

    // B) produkt
    let pa = prodAcc.get(p.id);
    if (!pa) {
      pa = {
        p,
        count: 0,
        value: 0,
        ourStock: eff.stock,
        stock7d: eff.stock7d,
        domeny: new Set(),
      };
      prodAcc.set(p.id, pa);
    }
    pa.count++;
    pa.value += price; // = počet odběratelů × naše cena
    const dom = resellerMeta.get(r.resellerId)?.domena;
    if (dom) pa.domeny.add(dom);
  }

  // ── Trend dle snapshotů (verzovaný Product.ourStock OBOU snapshotů) ──
  // Headline výše je z živého feedu; trend je férové porovnání verzovaných dat.
  const activeVersioned = countVersionedFromRows(rows, config, filters);
  const previous = await findPreviousSnapshot(snapshot);
  const prevVersioned = previous
    ? await countVersionedForSnapshot(previous.id, allowedIds, config, filters)
    : null;
  const trend: TrendSummary | null =
    previous && prevVersioned
      ? {
          previousSnapshotDate: previous.datumExportu,
          activeOpportunities: activeVersioned.total,
          previousOpportunities: prevVersioned.total,
          deltaOpportunities: activeVersioned.total - prevVersioned.total,
        }
      : null;
  const resellerDelta = (id: string): number | null =>
    trend
      ? (activeVersioned.byReseller.get(id) ?? 0) -
        (prevVersioned!.byReseller.get(id) ?? 0)
      : null;
  const productDelta = (ean: string): number | null =>
    trend
      ? (activeVersioned.byEan.get(ean) ?? 0) -
        (prevVersioned!.byEan.get(ean) ?? 0)
      : null;

  const resellerLeaderboard: ResellerRanking[] = [...resAcc.entries()]
    .map(([id, a]) => {
      const meta = resellerMeta.get(id)!;
      return {
        resellerId: id,
        domena: meta.domena,
        nazev: meta.nazev,
        opportunityCount: a.count,
        opportunityValue: a.value,
        brandCount: a.brands.size,
        categoryCount: a.cats.size,
        deltaCount: resellerDelta(id),
      };
    })
    .sort(
      (x, y) =>
        y.opportunityCount - x.opportunityCount ||
        y.opportunityValue - x.opportunityValue,
    );

  const topProducts: ProductRanking[] = [...prodAcc.values()]
    .map((a) => ({
      productId: a.p.id,
      ean: a.p.ean,
      nazev: a.p.nazev,
      size: a.p.size,
      producer: a.p.producer,
      kategorie: a.p.kategorie,
      ourStock: a.ourStock,
      stock7d: a.stock7d,
      resellerCount: a.count,
      value: a.value,
      domeny: [...a.domeny].sort(),
      deltaCount: productDelta(a.p.ean),
    }))
    .sort((x, y) => y.resellerCount - x.resellerCount || y.value - x.value);

  return {
    summary: {
      totalOpportunities,
      totalValue,
      resellersWithOpportunities: resAcc.size,
      productsWithOpportunities: prodAcc.size,
      snapshotDate: snapshot.datumExportu,
      trend,
    },
    resellerLeaderboard,
    topProducts,
  };
}

/**
 * RBAC vstup: rozsah odběratelů se odvodí z práv uživatele (analytics.viewall).
 * Pohodlný wrapper pro UI; samotná agregace bere scope jako vstup (testovatelné).
 */
export async function aggregateForUser(
  user: AuthUser,
  filters?: AnalyticsFilters,
): Promise<AnalyticsResult> {
  const visibleResellers = await getVisibleResellers(user, ANALYTICS_VIEWALL);
  return aggregateOpportunities({ visibleResellers, filters });
}
