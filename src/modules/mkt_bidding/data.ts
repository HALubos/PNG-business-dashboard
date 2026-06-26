import { prisma } from "@/lib/prisma";
import { loadBiddingConfig, type BiddingConfig } from "./config";
import {
  computeBids,
  type BiddingAction,
  type BiddingProductInput,
  type BiddingProposal,
} from "./engine";
import { loadPriceList, floorCpcFor } from "./pricelist";
import { loadMargins, maxCpaForRoas } from "./margins";

// ─────────────────────────────────────────────────────────────
// Datová vrstva modulu „Optimalizace srovnávačů". Spojí per-produkt metriky
// (ProductMetricFact, okno), katalog (ProductCatalogItem: cena/kategorie/dostupnost),
// ceník floor CPC, marže a minulé bidy (BiddingBid) → vstupy enginu → návrhy CPC.
// KPI/agregace zůstávají nad MetricFact/kpi.ts; tady je per-produkt detail (anti-drift).
// ─────────────────────────────────────────────────────────────

/** Klíč práva „viewall" modulu (scope projektů přes project-scope.ts). */
export const MKT_BIDDING_VIEWALL = "mkt_bidding.viewall";

export interface BiddingSummary {
  totalProducts: number;
  withBid: number;
  changes: number; // zvýšení/snížení/pauza oproti minulému bidu
  pausedOrSkipped: number;
  pairingRatePct: number | null; // feed ↔ API (katalog s metrikami / katalog)
  estDailySpend: number;
  byAction: Record<BiddingAction, number>;
}

export interface BiddingData {
  config: BiddingConfig;
  targetRoas: number;
  proposals: BiddingProposal[];
  summary: BiddingSummary;
  catalogCount: number;
  catalogRefreshedAt: Date | null;
  hasCatalog: boolean;
}

interface MetricAgg {
  clicks: number;
  cost: number;
  orders: number;
  revenue: number;
  categoryId: number | null;
  name: string | null;
}

function daysBetween(from: Date | null, to: Date | null, fallback: number): number {
  if (!from || !to) return fallback;
  const d = Math.round((to.getTime() - from.getTime()) / 86400000) + 1;
  return d > 0 ? d : fallback;
}

/**
 * Sestaví návrhy CPC pro projekt za období [from, to]. `targetRoas` přepíná agresivitu.
 */
export async function loadBiddingData(
  projectId: string,
  projectKlic: string,
  from: Date | null,
  to: Date | null,
  targetRoas: number,
): Promise<BiddingData> {
  const cfg = loadBiddingConfig(targetRoas);

  // 1) Per-produkt metriky v okně (zatím jediný srovnávač = heureka).
  const dateWhere: { gte?: Date; lte?: Date } = {};
  if (from) dateWhere.gte = from;
  if (to) dateWhere.lte = to;
  const facts = await prisma.productMetricFact.findMany({
    where: {
      projectId,
      source: "heureka",
      ...(from || to ? { date: dateWhere } : {}),
    },
    select: {
      itemId: true,
      categoryId: true,
      name: true,
      clicks: true,
      cost: true,
      orders: true,
      revenue: true,
    },
  });
  const metricByItem = new Map<string, MetricAgg>();
  for (const f of facts) {
    const a =
      metricByItem.get(f.itemId) ??
      ({ clicks: 0, cost: 0, orders: 0, revenue: 0, categoryId: null, name: null } as MetricAgg);
    a.clicks += f.clicks;
    a.cost += f.cost;
    a.orders += f.orders;
    a.revenue += f.revenue;
    if (a.categoryId == null && f.categoryId != null) a.categoryId = f.categoryId;
    if (!a.name && f.name) a.name = f.name;
    metricByItem.set(f.itemId, a);
  }

  // 2) Katalog (cena/kategorie/dostupnost) + 3) minulé bidy + 4) ceník/marže.
  const [catalog, bids, priceList, margins] = await Promise.all([
    prisma.productCatalogItem.findMany({ where: { projectId } }),
    prisma.biddingBid.findMany({ where: { projectId }, select: { itemId: true, cpc: true } }),
    loadPriceList(),
    loadMargins(projectKlic),
  ]);
  const currentCpc = new Map<string, number>();
  for (const b of bids) currentCpc.set(b.itemId, b.cpc);
  const catalogRefreshedAt = catalog[0]?.refreshedAt ?? null;

  // 5) Sestav vstupy enginu z katalogu (sellable universe) + metriky.
  let pairedWithMetrics = 0;
  const inputs: BiddingProductInput[] = catalog.map((c) => {
    const m = metricByItem.get(c.itemId);
    if (m) pairedWithMetrics++;
    const marginRow = c.internalCategory
      ? margins.byCategory.get(c.internalCategory.toLowerCase())
      : undefined;
    const marginPct = marginRow?.marginPct ?? margins.brandAvgMargin;
    return {
      itemId: c.itemId,
      name: c.name ?? m?.name ?? null,
      internalCategory: c.internalCategory,
      clicks: m?.clicks ?? 0,
      cost: m?.cost ?? 0,
      orders: m?.orders ?? 0,
      revenue: m?.revenue ?? 0,
      price: c.priceVat,
      available: c.available,
      floorCpc: floorCpcFor(priceList, m?.categoryId ?? null, c.priceVat),
      marginPct,
      maxCpa: maxCpaForRoas(marginRow, targetRoas),
      currentCpc: currentCpc.get(c.itemId) ?? null,
    };
  });

  const proposals = computeBids(inputs, cfg).sort((a, b) => {
    // Akční řádky nahoru: zvýšit/snížit/pauza před keep/skip.
    const rank = (x: BiddingProposal) =>
      x.action === "skip" ? 3 : x.action === "keep" ? 2 : x.proposedCpc == null ? 3 : 0;
    return rank(a) - rank(b) || (b.cost ?? 0) - (a.cost ?? 0);
  });

  // Souhrn.
  const byAction: Record<BiddingAction, number> = {
    increase: 0,
    decrease: 0,
    pause: 0,
    keep: 0,
    skip: 0,
  };
  let withBid = 0;
  for (const p of proposals) {
    byAction[p.action]++;
    if (p.proposedCpc != null) withBid++;
  }
  const windowDays = daysBetween(from, to, cfg.attributionWindowDays);
  let estDailySpend = 0;
  for (const p of proposals) {
    if (p.proposedCpc == null) continue;
    estDailySpend += p.proposedCpc * (p.clicks / windowDays);
  }

  const summary: BiddingSummary = {
    totalProducts: proposals.length,
    withBid,
    changes: byAction.increase + byAction.decrease + byAction.pause,
    pausedOrSkipped: byAction.pause + byAction.skip,
    pairingRatePct:
      catalog.length > 0 ? Math.round((pairedWithMetrics / catalog.length) * 1000) / 10 : null,
    estDailySpend: Math.round(estDailySpend * 100) / 100,
    byAction,
  };

  return {
    config: cfg,
    targetRoas,
    proposals,
    summary,
    catalogCount: catalog.length,
    catalogRefreshedAt,
    hasCatalog: catalog.length > 0,
  };
}
