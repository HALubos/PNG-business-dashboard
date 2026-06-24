import { prisma } from "@/lib/prisma";
import { computeKpi, type Kpi, type MetricRow } from "@/core/connectors/kpi";
import { isoWeekLabel } from "@/modules/mkt_ads/data";

// ─────────────────────────────────────────────────────────────
// Datová vrstva modulu „Web analytika". Čte VÝHRADNĚ z `MetricFact` a počítá
// KPI přes `kpi.ts` (jediný zdroj pravdy — žádné KPI v komponentách, žádný přístup
// k adaptérům). Zaměřuje se na návštěvnost (sessions/users), konverze a trend.
// Období + min/max hranice sdílí s modulem `mkt_ads` (anti-drift, neduplikovat).
// ─────────────────────────────────────────────────────────────

/** Klíč práva „viewall" modulu (scope projektů přes project-scope.ts). */
export const MKT_ANALYTICS_VIEWALL = "mkt_analytics.viewall";

export interface VisitDayPoint {
  date: string; // YYYY-MM-DD (UTC)
  sessions: number;
  users: number;
  conversions: number;
}

export interface VisitWeekPoint {
  /** Lidský štítek týdne, např. „2025-W03". */
  label: string;
  sessions: number;
  users: number;
}

export interface AnalyticsData {
  kpi: Kpi;
  daily: VisitDayPoint[];
  weekly: VisitWeekPoint[];
  hasData: boolean;
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Načte metriky projektu za období a sestaví podklady pro stránku Web analytiky.
 * `from`/`to` jsou inkluzivní hranice (null = bez hranice).
 */
export async function loadAnalyticsData(
  projectId: string,
  from: Date | null,
  to: Date | null,
): Promise<AnalyticsData> {
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

  // KPI nad celým obdobím (navstevy/uzivatele/konverze/konverzní poměr z kpi.ts).
  const rows: MetricRow[] = facts.map((f) => ({
    source: f.source,
    metric: f.metric,
    value: f.value,
  }));
  const kpi = computeKpi(rows);

  // Denní řada: sessions / users / conversions (suma napříč zdroji daného dne).
  const perDay = new Map<string, VisitDayPoint>();
  for (const f of facts) {
    const key = dayKey(f.date);
    const p =
      perDay.get(key) ?? { date: key, sessions: 0, users: 0, conversions: 0 };
    if (f.metric === "sessions") p.sessions += f.value;
    else if (f.metric === "users") p.users += f.value;
    else if (f.metric === "conversions") p.conversions += f.value;
    perDay.set(key, p);
  }
  const daily = [...perDay.values()].sort((a, b) => a.date.localeCompare(b.date));

  // Týdenní trend (z denní řady) — sdílený ISO-týden helper s mkt_ads.
  const perWeek = new Map<string, VisitWeekPoint>();
  for (const p of daily) {
    const label = isoWeekLabel(new Date(`${p.date}T00:00:00Z`));
    const w = perWeek.get(label) ?? { label, sessions: 0, users: 0 };
    w.sessions += p.sessions;
    w.users += p.users;
    perWeek.set(label, w);
  }
  const weekly = [...perWeek.values()].sort((a, b) =>
    a.label.localeCompare(b.label),
  );

  return { kpi, daily, weekly, hasData: facts.length > 0 };
}
