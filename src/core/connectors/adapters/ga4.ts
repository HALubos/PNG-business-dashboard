import type { ConnectorAdapter } from "../types";
import type { CanonicalMetric, CanonicalMetricKey } from "../metrics";
import { toDay } from "../metrics";
import { decryptJson } from "../crypto";
import { googleOAuthConfig, refreshGoogleAccessToken } from "../oauth/google";

// ─────────────────────────────────────────────────────────────
// Google Analytics 4 — návštěvnost (sessions, users) a konverze přes Analytics
// Data API (v1beta `runReport`). OAuth API: refresh token + propertyId jsou
// uložené ŠIFROVANĚ v `Connector.credentialsEnc` (připojení viz OAuth flow na
// /api/connectors/ga4/*). Refresh access tokenu řešíme uvnitř adaptéru.
//
// REVENUE = jen KONTROLNÍ metrika: GA4 emituje `revenue` (purchaseRevenue), ale
// pravidlo priority tržeb v `kpi.ts` ho PŘEBÍJÍ e-shop zdrojem (`overridesRevenue`,
// Shoptet). Kde e-shop konektor není, tržby padají na GA4 (fallback) — proto GA4
// `overridesRevenue` NEMÁ a revenue se ukládá pod kanonický klíč `revenue`.
//
// INKREMENT × KOREKTNOST: GA4 vrací ÚPLNÉ denní agregáty (na rozdíl od Shoptetu
// nehrozí částečný den), takže přepis `MetricFact` per den je vždy správný. Data
// ale dozrávají se zpožděním → re-fetchujeme i `TRAILING_REFETCH_DAYS` dnů zpět od
// cursoru, aby se pozdě dorovnaná čísla přepsala. Cursor = nejnovější vrácený den.
// ─────────────────────────────────────────────────────────────

const DATA_API = "https://analyticsdata.googleapis.com/v1beta";
const PAGE_SIZE = 100_000; // GA4 limit; denní granularita ⇒ řádů stovky řádků
const TRAILING_REFETCH_DAYS = 2; // GA4 data dozrává — přepočítej i pár dní zpět

interface Ga4Credentials {
  refreshToken: string;
  propertyId: string;
}

// Mapování GA4 metrik → kanonické klíče. revenue = kontrolní (viz hlavička).
const METRICS: { api: string; canonical: CanonicalMetricKey }[] = [
  { api: "sessions", canonical: "sessions" },
  { api: "totalUsers", canonical: "users" },
  { api: "conversions", canonical: "conversions" },
  { api: "purchaseRevenue", canonical: "revenue" },
];

/** Datum pro GA4 (`startDate`) jako YYYY-MM-DD (UTC). */
function ga4DateParam(d: Date): string {
  return toDay(d).toISOString().slice(0, 10);
}

/** GA4 vrací datum jako „YYYYMMDD" → Date (půlnoc UTC). */
function parseGa4Date(s: string): Date | null {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(s.trim());
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

/** Default backfill (když by `since` chybělo) — bez závislosti na sync.ts (cyklus). */
function backfillDefault(): Date {
  const raw = process.env.MARKETING_BACKFILL_FROM || "2025-01-01";
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? new Date("2025-01-01") : d;
}

interface RunReportResponse {
  rowCount?: number;
  rows?: {
    dimensionValues?: { value?: string }[];
    metricValues?: { value?: string }[];
  }[];
}

export const ga4Adapter: ConnectorAdapter = {
  type: "ga4",
  kind: "oauth_api",
  nazev: "Google Analytics 4",
  popis: "Návštěvnost a konverze z GA4 (OAuth, jen pro čtení).",
  icon: "LineChart",
  category: "analytika",

  async sync({ connector, since }): Promise<CanonicalMetric[]> {
    const cfg = googleOAuthConfig();
    if (!cfg) {
      throw new Error(
        "GA4 OAuth není nakonfigurováno (chybí GOOGLE_OAUTH_CLIENT_ID / SECRET v .env).",
      );
    }
    if (!connector.credentialsEnc) {
      throw new Error("GA4 konektor nemá uložené přihlášení — připojte přes Google.");
    }
    const creds = decryptJson<Ga4Credentials>(connector.credentialsEnc);
    if (!creds.propertyId) throw new Error("GA4 konektor nemá nastavené Property ID.");

    const isFirstSync = !connector.cursor;
    // Trailing okno: stáhni i pár dní před cursorem (GA4 data dozrává) — přepis je OK.
    const start = new Date(since ?? backfillDefault());
    start.setUTCDate(start.getUTCDate() - TRAILING_REFETCH_DAYS);

    const accessToken = await refreshGoogleAccessToken(cfg, creds.refreshToken);

    // Agregace na den: každý kanonický klíč zvlášť (sessions/users/conversions/revenue).
    const byDay = new Map<number, Record<string, number>>();
    let offset = 0;
    let totalRows = 0;
    // Stránkování přes offset/limit (denní granularita ⇒ obvykle jediná stránka).
    do {
      const res = await fetch(
        `${DATA_API}/properties/${encodeURIComponent(creds.propertyId)}:runReport`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            dateRanges: [{ startDate: ga4DateParam(start), endDate: "today" }],
            dimensions: [{ name: "date" }],
            metrics: METRICS.map((m) => ({ name: m.api })),
            orderBys: [{ dimension: { dimensionName: "date" } }],
            limit: PAGE_SIZE,
            offset,
          }),
        },
      );
      if (!res.ok) {
        throw new Error(
          `GA4 Data API selhalo (${res.status}): ${(await res.text()).slice(0, 300)}`,
        );
      }
      const json = (await res.json()) as RunReportResponse;
      totalRows = Number(json.rowCount ?? 0);
      const rows = json.rows ?? [];
      for (const row of rows) {
        const date = parseGa4Date(row.dimensionValues?.[0]?.value ?? "");
        if (!date) continue;
        const dayMs = date.getTime();
        const agg = byDay.get(dayMs) ?? {};
        METRICS.forEach((m, i) => {
          const v = Number(row.metricValues?.[i]?.value ?? 0);
          agg[m.canonical] = (agg[m.canonical] ?? 0) + (Number.isFinite(v) ? v : 0);
        });
        byDay.set(dayMs, agg);
      }
      offset += rows.length;
      if (rows.length === 0) break;
    } while (offset < totalRows);

    // Tripwiry (vzor jako shoptet/processResellerFeed): první sync bez dat = chyba;
    // inkrement bez dat = legitimní prázdno (od cursoru se nic nezměnilo).
    if (byDay.size === 0) {
      if (isFirstSync) {
        throw new Error(
          "GA4 nevrátilo žádná data — zkontrolujte Property ID a oprávnění účtu.",
        );
      }
      return [];
    }

    const out: CanonicalMetric[] = [];
    for (const [dayMs, agg] of byDay) {
      const date = new Date(dayMs);
      for (const m of METRICS) {
        out.push({ source: "ga4", date, metric: m.canonical, value: agg[m.canonical] ?? 0 });
      }
    }
    return out;
  },
};
