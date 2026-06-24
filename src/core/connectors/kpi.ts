import type { ConnectorType } from "@/generated/prisma/client";
import type { CanonicalMetricKey } from "./metrics";
import { getConnectorAdapter } from "./registry";

// ─────────────────────────────────────────────────────────────
// Odvozená KPI nad KANONIKOU = JEDINÉ místo výpočtu (anti-drift, obdoba rules.ts).
// Moduly `mkt_ads` i `mkt_analytics` volají odsud, nikdy nepočítají KPI per-konektor.
//
//   ROAS  = tržby / náklady
//   PNO   = náklady / tržby
//   konverzní poměr = konverze / návštěvy
//
// PRAVIDLO PRIORITY TRŽEB (drženo JEN tady): je-li mezi zdroji e-shop konektor
// s `overridesRevenue` (Shoptet apod.), bere se jeho `revenue` a PŘEBÍJÍ GA4;
// jinak fallback na GA4 revenue.
// ─────────────────────────────────────────────────────────────

/** Jeden řádek kanonické metriky (výřez `MetricFact` za zvolené období/projekt). */
export interface MetricRow {
  source: ConnectorType;
  metric: string;
  value: number;
}

export interface Kpi {
  trzby: number; // revenue (dle priority zdroje)
  naklady: number; // cost (součet reklamních platforem)
  konverze: number;
  navstevy: number; // sessions
  uzivatele: number; // users
  imprese: number;
  prokliky: number;
  roas: number | null; // trzby / naklady
  pno: number | null; // naklady / trzby
  konverzniPomer: number | null; // konverze / navstevy
  zdrojTrzeb: "eshop" | "ga4" | "zadny"; // odkud se vzaly tržby (transparentnost)
}

function sumMetric(rows: MetricRow[], metric: CanonicalMetricKey): number {
  let s = 0;
  for (const r of rows) if (r.metric === metric) s += r.value;
  return s;
}

/**
 * Autoritativní tržby: priorita e-shop zdrojů (`overridesRevenue`) → GA4 fallback.
 * Vrací i informaci, odkud se tržby vzaly.
 */
export function resolveRevenue(rows: MetricRow[]): {
  revenue: number;
  source: "eshop" | "ga4" | "zadny";
} {
  let eshop = 0;
  let hasEshop = false;
  let ga4 = 0;
  let hasGa4 = false;

  for (const r of rows) {
    if (r.metric !== "revenue") continue;
    const adapter = getConnectorAdapter(r.source);
    if (adapter?.overridesRevenue) {
      eshop += r.value;
      hasEshop = true;
    } else if (r.source === "ga4") {
      ga4 += r.value;
      hasGa4 = true;
    }
  }

  if (hasEshop) return { revenue: eshop, source: "eshop" };
  if (hasGa4) return { revenue: ga4, source: "ga4" };
  return { revenue: 0, source: "zadny" };
}

/** Spočítá KPI z kanonických řádků (jednoho projektu za období). */
export function computeKpi(rows: MetricRow[]): Kpi {
  const { revenue, source } = resolveRevenue(rows);
  // Náklady = jen reklamní platformy (jediné, které emitují `cost`).
  const naklady = sumMetric(rows, "cost");
  const konverze = sumMetric(rows, "conversions");
  const navstevy = sumMetric(rows, "sessions");
  const uzivatele = sumMetric(rows, "users");
  const imprese = sumMetric(rows, "impressions");
  const prokliky = sumMetric(rows, "clicks");

  return {
    trzby: revenue,
    naklady,
    konverze,
    navstevy,
    uzivatele,
    imprese,
    prokliky,
    roas: naklady > 0 ? revenue / naklady : null,
    pno: revenue > 0 ? naklady / revenue : null,
    konverzniPomer: navstevy > 0 ? konverze / navstevy : null,
    zdrojTrzeb: source,
  };
}
