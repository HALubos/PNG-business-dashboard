import type { ConnectorType } from "@/generated/prisma/client";

// ─────────────────────────────────────────────────────────────
// Kanonický slovník metrik = JEDINÝ zdroj pravdy (anti-drift, obdoba rules.ts).
// Každý adaptér mapuje svá syrová data na tyto ATOMICKÉ metriky; odvozená KPI
// (ROAS, PNO, konverzní poměr) se počítají AŽ nad kanonikou v `kpi.ts` — nikdy
// per-konektor.
// ─────────────────────────────────────────────────────────────

export const CANONICAL_METRICS = [
  "cost", // náklady (reklamní platformy)
  "revenue", // tržby (e-shop / GA4)
  "impressions", // imprese
  "clicks", // prokliky
  "conversions", // konverze (objednávky / cíle)
  "sessions", // návštěvy
  "users", // uživatelé
] as const;

export type CanonicalMetricKey = (typeof CANONICAL_METRICS)[number];

const CANONICAL_SET = new Set<string>(CANONICAL_METRICS);

/** Je řetězec platný kanonický klíč metriky? */
export function isCanonicalMetric(key: string): key is CanonicalMetricKey {
  return CANONICAL_SET.has(key);
}

/** Lidské popisky metrik (UI, exporty). */
export const METRIC_LABELS: Record<CanonicalMetricKey, string> = {
  cost: "Náklady",
  revenue: "Tržby",
  impressions: "Imprese",
  clicks: "Prokliky",
  conversions: "Konverze",
  sessions: "Návštěvy",
  users: "Uživatelé",
};

/**
 * Kanonická metrika, kterou vrací adaptér. `date` je den (granularita = den);
 * normalizaci na půlnoc UTC zajisti přes `toDay()`.
 */
export interface CanonicalMetric {
  source: ConnectorType;
  date: Date;
  metric: CanonicalMetricKey;
  value: number;
}

/** Ořízne čas na půlnoc UTC (denní granularita = klíč MetricFact). */
export function toDay(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}
