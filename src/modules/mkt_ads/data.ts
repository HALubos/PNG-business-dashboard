import type { ConnectorType } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  computeKpi,
  resolveRevenue,
  type Kpi,
  type MetricRow,
  type VatMode,
} from "@/core/connectors/kpi";

// ─────────────────────────────────────────────────────────────
// Datová vrstva modulu „Reklamní výkon". Čte VÝHRADNĚ z `MetricFact` a počítá
// KPI přes `kpi.ts` (jediný zdroj pravdy — žádné KPI v komponentách, žádný přístup
// k adaptérům). Vrací podklady pro KPI hlavičku a grafy (denní řada, dle platformy,
// týdenní srovnání).
// ─────────────────────────────────────────────────────────────

/** Klíč práva „viewall" modulu (scope projektů přes project-scope.ts). */
export const MKT_ADS_VIEWALL = "mkt_ads.viewall";

export interface DayPoint {
  date: string; // YYYY-MM-DD (UTC)
  revenue: number;
  cost: number;
  conversions: number;
}

export interface PlatformCost {
  source: ConnectorType;
  cost: number;
}

export interface WeekPoint {
  /** Lidský štítek týdne, např. „2025-W03". */
  label: string;
  revenue: number;
  cost: number;
}

export interface AdsData {
  kpi: Kpi;
  /** Počet reklamních platforem s náklady v období. */
  platformCount: number;
  daily: DayPoint[];
  byPlatform: PlatformCost[];
  weekly: WeekPoint[];
  hasData: boolean;
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** ISO týden (pondělí–neděle) jako „RRRR-Www" — pro týdenní srovnání. Sdílené i mkt_analytics. */
export function isoWeekLabel(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  // ISO: čtvrtek téhož týdne určuje rok i číslo týdne.
  const dayNum = (date.getUTCDay() + 6) % 7; // Po=0 … Ne=6
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week =
    1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 86400000));
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Min/max den dat projektu (pro výchozí rozsah „vše" a popisky). */
export async function getProjectDateBounds(
  projectId: string,
): Promise<{ min: Date | null; max: Date | null }> {
  const [min, max] = await Promise.all([
    prisma.metricFact.findFirst({
      where: { projectId },
      orderBy: { date: "asc" },
      select: { date: true },
    }),
    prisma.metricFact.findFirst({
      where: { projectId },
      orderBy: { date: "desc" },
      select: { date: true },
    }),
  ]);
  return { min: min?.date ?? null, max: max?.date ?? null };
}

/**
 * Načte metriky projektu za období a sestaví podklady pro stránku.
 * `from`/`to` jsou inkluzivní hranice (null = bez hranice).
 */
export async function loadAdsData(
  projectId: string,
  from: Date | null,
  to: Date | null,
  vatMode: VatMode = "without",
): Promise<AdsData> {
  const dateWhere: { gte?: Date; lte?: Date } = {};
  if (from) dateWhere.gte = from;
  if (to) dateWhere.lte = to;

  const facts = await prisma.metricFact.findMany({
    where: {
      projectId,
      ...(from || to ? { date: dateWhere } : {}),
    },
    select: { source: true, date: true, metric: true, value: true },
    orderBy: { date: "asc" },
  });

  // KPI nad celým obdobím (priorita tržeb + náklady řeší kpi.ts).
  const rows: MetricRow[] = facts.map((f) => ({
    source: f.source,
    metric: f.metric,
    value: f.value,
  }));
  const kpi = computeKpi(rows, vatMode);

  // Denní řada: revenue přes pravidlo priority (resolveRevenue per den), cost + conversions sumou.
  const perDay = new Map<string, MetricRow[]>();
  for (const f of facts) {
    const key = dayKey(f.date);
    const arr = perDay.get(key) ?? [];
    arr.push({ source: f.source, metric: f.metric, value: f.value });
    perDay.set(key, arr);
  }
  const daily: DayPoint[] = [...perDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, dayRows]) => ({
      date,
      revenue: resolveRevenue(dayRows, vatMode).revenue,
      cost: dayRows.filter((r) => r.metric === "cost").reduce((s, r) => s + r.value, 0),
      conversions: dayRows
        .filter((r) => r.metric === "conversions")
        .reduce((s, r) => s + r.value, 0),
    }));

  // Náklady dle platformy (jen zdroje, které emitují cost = reklamní platformy).
  const costBySource = new Map<ConnectorType, number>();
  for (const f of facts) {
    if (f.metric !== "cost") continue;
    costBySource.set(f.source, (costBySource.get(f.source) ?? 0) + f.value);
  }
  const byPlatform: PlatformCost[] = [...costBySource.entries()]
    .map(([source, cost]) => ({ source, cost }))
    .sort((a, b) => b.cost - a.cost);

  // Týdenní srovnání (z denní řady).
  const perWeek = new Map<string, WeekPoint>();
  for (const p of daily) {
    const label = isoWeekLabel(new Date(`${p.date}T00:00:00Z`));
    const w = perWeek.get(label) ?? { label, revenue: 0, cost: 0 };
    w.revenue += p.revenue;
    w.cost += p.cost;
    perWeek.set(label, w);
  }
  const weekly = [...perWeek.values()].sort((a, b) => a.label.localeCompare(b.label));

  return {
    kpi,
    platformCount: byPlatform.length,
    daily,
    byPlatform,
    weekly,
    hasData: facts.length > 0,
  };
}
