import type { ConnectorAdapter } from "../types";
import type { CanonicalMetric, CanonicalMetricKey } from "../metrics";
import { toDay } from "../metrics";
import { decryptJson } from "../crypto";
import { prisma } from "@/lib/prisma";

// ─────────────────────────────────────────────────────────────
// Heureka.cz (srovnávač) — náklady, prokliky, konverze a (kontrolní) tržby.
// Heureka API je TOKEN-BASED (ne OAuth roundtrip): člověk zadá API klíč v Integraci
// (per projekt), ukládá se ŠIFROVANĚ v `Connector.credentialsEnc`; fallback `.env`
// `HEUREKA_API_KEY`. `kind` zůstává `oauth_api` (credentials-based, jako Sklik).
//
// API (ověřeno na účtu Pinguin):
//   GET https://api.heureka.group/v1/reports/conversions?date=YYYY-MM-DD
//   Hlavička: x-heureka-api-key: <KLÍČ>
//   Vrací konverze za JEDEN den (pole `conversions`, po produktech) → voláme den po dni.
//
// `sync()` AGREGUJE produkty na DENNÍ kanonické metriky (`source = heureka`):
//   cost        = Σ costs_without_vat.total   (BEZ DPH, jako Sklik/Google/Meta)
//   clicks      = Σ visits.total
//   conversions = Σ orders.total
//   revenue     = Σ revenue.total             (KONTROLNÍ — Heureka NEMÁ overridesRevenue;
//                                              tržby přebíjí e-shop shoptet_orders v kpi.ts)
// Náklady se v kpi.ts jen SČÍTAJÍ napříč ad zdroji — žádná nová KPI logika.
//
// INKREMENT × KOREKTNOST: denní agregáty jsou úplné → přepis `MetricFact` per den je
// správný; konverze/tržby dozrávají → re-fetch `TRAILING_REFETCH_DAYS` zpět. Cursor =
// nejnovější den. Tripwiry jako u ostatních (první sync bez dat = chyba; inkrement bez
// dat = prázdno).
//
// Per-produktová granularita (pro modul bidding) řeší samostatná vrstva nad stejným
// stažením — viz `src/modules/mkt_bidding/` (Dávka 5, per-produkt commit).
// ─────────────────────────────────────────────────────────────

const API_URL = "https://api.heureka.group/v1/reports/conversions";
const TRAILING_REFETCH_DAYS = 3;
const MAX_BACKFILL_DAYS = 800; // pojistka proti nekonečné smyčce (≈ 2+ roky)

interface HeurekaCredentials {
  apiKey?: string;
  /** Volitelná URL katalogového XML feedu (cena/kategorie/dostupnost — bidding). */
  catalogUrl?: string;
}

/** Jeden záznam konverze (zkráceno na pole, která čteme). */
export interface HeurekaConversionRow {
  date?: string;
  product_card_id?: string;
  shop_item?: { id?: string; name?: string };
  portal_category?: { id?: number };
  visits?: { total?: number };
  costs_without_vat?: { total?: number };
  costs_with_vat?: { total?: number };
  orders?: { total?: number };
  revenue?: { total?: number };
}

interface HeurekaConversionsResponse {
  conversions?: HeurekaConversionRow[];
}

/** Default backfill (když by `since` chybělo) — bez závislosti na sync.ts (cyklus). */
function backfillDefault(): Date {
  const raw = process.env.MARKETING_BACKFILL_FROM || "2025-01-01";
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? new Date("2025-01-01") : d;
}

function ymd(d: Date): string {
  return toDay(d).toISOString().slice(0, 10);
}

/** „YYYY-MM-DD" → Date (půlnoc UTC). */
function parseDateUtc(s: string | undefined): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s.trim());
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Resolver API klíče: credentialsEnc → fallback HEUREKA_API_KEY. */
export function resolveHeurekaApiKey(credentialsEnc: string | null): string {
  let key = "";
  if (credentialsEnc) {
    const creds = decryptJson<HeurekaCredentials>(credentialsEnc);
    key = creds.apiKey || "";
  }
  return key || process.env.HEUREKA_API_KEY || "";
}

/**
 * Stáhne konverze za JEDEN den. Vrací pole konverzí (i prázdné). Hází jen na skutečné
 * HTTP/API chyby — prázdný den (200, žádné konverze) je legitimní.
 */
export async function fetchHeurekaConversions(
  apiKey: string,
  day: Date,
): Promise<HeurekaConversionRow[]> {
  const res = await fetch(`${API_URL}?date=${ymd(day)}`, {
    headers: { "x-heureka-api-key": apiKey, accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(
      `Heureka API selhalo pro ${ymd(day)} (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}`,
    );
  }
  const json = (await res.json()) as HeurekaConversionsResponse;
  return json.conversions ?? [];
}

const METRIC_KEYS: CanonicalMetricKey[] = ["cost", "clicks", "conversions", "revenue"];

interface ProductFactAgg {
  dayMs: number;
  itemId: string;
  categoryId: number | null;
  name: string | null;
  clicks: number;
  cost: number;
  orders: number;
  revenue: number;
}

/** Upsert per-produktových denních faktů (source = heureka). Přepis dne je správný. */
async function upsertProductFacts(
  projectId: string,
  byProduct: Map<string, ProductFactAgg>,
): Promise<void> {
  for (const p of byProduct.values()) {
    const date = new Date(p.dayMs);
    await prisma.productMetricFact.upsert({
      where: {
        projectId_source_date_itemId: {
          projectId,
          source: "heureka",
          date,
          itemId: p.itemId,
        },
      },
      update: {
        categoryId: p.categoryId,
        name: p.name,
        clicks: p.clicks,
        cost: p.cost,
        orders: p.orders,
        revenue: p.revenue,
      },
      create: {
        projectId,
        source: "heureka",
        date,
        itemId: p.itemId,
        categoryId: p.categoryId,
        name: p.name,
        clicks: p.clicks,
        cost: p.cost,
        orders: p.orders,
        revenue: p.revenue,
      },
    });
  }
}

/** Seznam dnů [start, end] (půlnoci UTC, inkluzivně), s pojistkou na max délku. */
export function dayRange(start: Date, end: Date): Date[] {
  const days: Date[] = [];
  const cur = toDay(start);
  const last = toDay(end);
  let guard = 0;
  while (cur.getTime() <= last.getTime() && guard < MAX_BACKFILL_DAYS) {
    days.push(new Date(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
    guard++;
  }
  return days;
}

export const heurekaAdapter: ConnectorAdapter = {
  type: "heureka",
  kind: "oauth_api",
  nazev: "Heureka",
  popis: "Náklady, prokliky a konverze ze srovnávače Heureka.cz.",
  icon: "ShoppingCart",
  category: "srovnavace",
  // overridesRevenue ZÁMĚRNĚ NEnastaveno — tržby Heureky jsou KONTROLNÍ (přebíjí je
  // e-shop shoptet_orders dle pravidla priority v kpi.ts; stejný princip jako GA4).

  async sync({ connector, since }): Promise<CanonicalMetric[]> {
    const apiKey = resolveHeurekaApiKey(connector.credentialsEnc);
    if (!apiKey) {
      throw new Error(
        "Heureka konektor nemá API klíč — připojte v Integraci (nebo nastavte HEUREKA_API_KEY).",
      );
    }

    const isFirstSync = !connector.cursor;
    const start = new Date(since ?? backfillDefault());
    start.setUTCDate(start.getUTCDate() - TRAILING_REFETCH_DAYS);
    const end = new Date();

    // Agregace přes produkty na DENNÍ granularitu (kanonika) + PER-PRODUKT vrstva.
    const byDay = new Map<number, Record<string, number>>();
    // Klíč per-produkt = `${dayMs}|${itemId}`.
    const byProduct = new Map<string, ProductFactAgg>();
    for (const day of dayRange(start, end)) {
      const rows = await fetchHeurekaConversions(apiKey, day);
      for (const row of rows) {
        const date = parseDateUtc(row.date) ?? toDay(day);
        const dayMs = date.getTime();
        const cost = num(row.costs_without_vat?.total);
        const clicks = num(row.visits?.total);
        const orders = num(row.orders?.total);
        const revenue = num(row.revenue?.total);

        const agg = byDay.get(dayMs) ?? {};
        agg.cost = (agg.cost ?? 0) + cost;
        agg.clicks = (agg.clicks ?? 0) + clicks;
        agg.conversions = (agg.conversions ?? 0) + orders;
        agg.revenue = (agg.revenue ?? 0) + revenue;
        byDay.set(dayMs, agg);

        // Per-produkt: agreguj přes řádky téhož produktu/dne (různé click_source).
        const itemId = (row.shop_item?.id ?? "").trim();
        if (itemId) {
          const pKey = `${dayMs}|${itemId}`;
          const p =
            byProduct.get(pKey) ??
            ({
              dayMs,
              itemId,
              categoryId: row.portal_category?.id ?? null,
              name: row.shop_item?.name ?? null,
              clicks: 0,
              cost: 0,
              orders: 0,
              revenue: 0,
            } satisfies ProductFactAgg);
          p.clicks += clicks;
          p.cost += cost;
          p.orders += orders;
          p.revenue += revenue;
          if (p.categoryId == null && row.portal_category?.id != null)
            p.categoryId = row.portal_category.id;
          if (!p.name && row.shop_item?.name) p.name = row.shop_item.name;
          byProduct.set(pKey, p);
        }
      }
    }

    // Per-produktová vrstva: upsert (přepis dne je správný — denní agregát je úplný).
    await upsertProductFacts(connector.projectId, byProduct);

    // Tripwiry: první sync bez dat = chyba; inkrement bez dat = legitimní prázdno.
    if (byDay.size === 0) {
      if (isFirstSync) {
        throw new Error(
          "Heureka nevrátila žádná data — zkontrolujte API klíč a aktivní PPC kampaně.",
        );
      }
      return [];
    }

    const out: CanonicalMetric[] = [];
    for (const [dayMs, agg] of byDay) {
      const date = new Date(dayMs);
      for (const m of METRIC_KEYS) {
        out.push({ source: "heureka", date, metric: m, value: agg[m] ?? 0 });
      }
    }
    return out;
  },
};
