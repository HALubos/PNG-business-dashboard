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
//
// REŽIM DPH: kanonický `revenue` je BEZ DPH. Přepínač „s DPH" přičte `revenue_vat`
// (DPH část, kterou emitují e-shop zdroje). Drženo JEN tady — moduly jen předají režim.
// ─────────────────────────────────────────────────────────────

/** Režim zobrazení tržeb: bez DPH (kanonický základ) nebo s DPH (+ `revenue_vat`). */
export type VatMode = "with" | "without";

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
export function resolveRevenue(
  rows: MetricRow[],
  vatMode: VatMode = "without",
): {
  revenue: number;
  source: "eshop" | "ga4" | "zadny";
} {
  let eshop = 0;
  let eshopVat = 0;
  let hasEshop = false;
  let ga4 = 0;
  let ga4Vat = 0;
  let hasGa4 = false;

  for (const r of rows) {
    if (r.metric !== "revenue" && r.metric !== "revenue_vat") continue;
    const adapter = getConnectorAdapter(r.source);
    if (adapter?.overridesRevenue) {
      if (r.metric === "revenue") {
        eshop += r.value;
        hasEshop = true;
      } else eshopVat += r.value;
    } else if (r.source === "ga4") {
      if (r.metric === "revenue") {
        ga4 += r.value;
        hasGa4 = true;
      } else ga4Vat += r.value;
    }
  }

  const vat = vatMode === "with";
  if (hasEshop) return { revenue: eshop + (vat ? eshopVat : 0), source: "eshop" };
  if (hasGa4) return { revenue: ga4 + (vat ? ga4Vat : 0), source: "ga4" };
  return { revenue: 0, source: "zadny" };
}

/** Spočítá KPI z kanonických řádků (jednoho projektu za období). */
export function computeKpi(rows: MetricRow[], vatMode: VatMode = "without"): Kpi {
  const { revenue, source } = resolveRevenue(rows, vatMode);
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
