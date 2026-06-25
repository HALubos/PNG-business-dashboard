import type { ConnectorAdapter } from "../types";
import type { CanonicalMetric, CanonicalMetricKey } from "../metrics";
import { toDay } from "../metrics";
import { decryptJson } from "../crypto";
import { googleOAuthConfig, refreshGoogleAccessToken } from "../oauth/google";

// ─────────────────────────────────────────────────────────────
// Google Ads — náklady, imprese, prokliky, konverze přes Google Ads API
// (`googleAds:searchStream`, GAQL). OAuth API: refresh token + customerId jsou
// uložené ŠIFROVANĚ v `Connector.credentialsEnc` (připojení viz OAuth flow na
// /api/connectors/google-ads/*). Refresh access tokenu řešíme uvnitř adaptéru
// (sdílený Google OAuth helper, stejný client jako GA4). Vedle OAuth je potřeba
// developer token (`GOOGLE_ADS_DEVELOPER_TOKEN`) jako hlavička každého requestu.
//
// INKREMENT × KOREKTNOST: Google Ads vrací ÚPLNÉ denní agregáty (na rozdíl od
// Shoptetu nehrozí částečný den), takže přepis `MetricFact` per den je vždy
// správný. Konverze (a do jisté míry náklady) se ale dorovnávají zpětně →
// re-fetchujeme i `TRAILING_REFETCH_DAYS` dnů zpět od cursoru. Cursor = nejnovější
// vrácený den. Tripwiry jako u GA4/shoptetu (první sync bez dat = chyba; inkrement
// bez dat = legitimní prázdno).
//
// Pozn.: searchStream vrátí celý report v jedné odpovědi (pole „stream chunků");
// při denní granularitě na úrovni účtu jde o stovky řádků → žádné stránkování
// nepotřebujeme. Rate-limity řeší dávkové stahování po projektech ve scheduleru.
// ─────────────────────────────────────────────────────────────

const API_VERSION = "v18";
const TRAILING_REFETCH_DAYS = 3; // konverze/náklady se dorovnávají zpětně

interface GoogleAdsCredentials {
  refreshToken: string;
  customerId: string; // 10 číslic bez pomlček (např. "1234567890")
  loginCustomerId?: string; // manažerský účet (MCC) — volitelné
}

// Mapování GAQL metrik → kanonické klíče. cost_micros je v mikronech (÷ 1e6).
const METRIC_KEYS: CanonicalMetricKey[] = [
  "cost",
  "impressions",
  "clicks",
  "conversions",
];

/** Datum pro GAQL (`YYYY-MM-DD`, UTC). */
function gaqlDate(d: Date): string {
  return toDay(d).toISOString().slice(0, 10);
}

/** Default backfill (když by `since` chybělo) — bez závislosti na sync.ts (cyklus). */
function backfillDefault(): Date {
  const raw = process.env.MARKETING_BACKFILL_FROM || "2025-01-01";
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? new Date("2025-01-01") : d;
}

/** Normalizuje customerId na 10 číslic (sundá pomlčky/mezery). */
function normalizeCustomerId(raw: string): string {
  return raw.replace(/\D/g, "");
}

interface SearchStreamRow {
  segments?: { date?: string };
  metrics?: {
    costMicros?: string;
    impressions?: string;
    clicks?: string;
    conversions?: number;
  };
}

interface SearchStreamChunk {
  results?: SearchStreamRow[];
}

export const googleAdsAdapter: ConnectorAdapter = {
  type: "google_ads",
  kind: "oauth_api",
  nazev: "Google Ads",
  popis: "Náklady, prokliky a konverze z Google Ads.",
  icon: "Megaphone",
  category: "reklama",

  async sync({ connector, since }): Promise<CanonicalMetric[]> {
    const cfg = googleOAuthConfig();
    if (!cfg) {
      throw new Error(
        "Google OAuth není nakonfigurováno (chybí GOOGLE_OAUTH_CLIENT_ID / SECRET v .env).",
      );
    }
    const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    if (!devToken) {
      throw new Error(
        "Chybí GOOGLE_ADS_DEVELOPER_TOKEN v .env — nutný pro Google Ads API.",
      );
    }
    if (!connector.credentialsEnc) {
      throw new Error(
        "Google Ads konektor nemá uložené přihlášení — připojte přes Google.",
      );
    }
    const creds = decryptJson<GoogleAdsCredentials>(connector.credentialsEnc);
    const customerId = normalizeCustomerId(creds.customerId ?? "");
    if (!customerId) {
      throw new Error("Google Ads konektor nemá nastavené ID účtu (customer ID).");
    }

    const isFirstSync = !connector.cursor;
    // Trailing okno: stáhni i pár dní před cursorem (zpětné dorovnání) — přepis je OK.
    const start = new Date(since ?? backfillDefault());
    start.setUTCDate(start.getUTCDate() - TRAILING_REFETCH_DAYS);
    const end = new Date(); // dnešek (UTC), GAQL bere uzavřený interval

    const accessToken = await refreshGoogleAccessToken(cfg, creds.refreshToken);

    const query =
      "SELECT segments.date, metrics.cost_micros, metrics.impressions, " +
      "metrics.clicks, metrics.conversions FROM customer " +
      `WHERE segments.date BETWEEN '${gaqlDate(start)}' AND '${gaqlDate(end)}'`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      "developer-token": devToken,
      "Content-Type": "application/json",
    };
    // Manažerský (MCC) účet — jen když je nastavený.
    if (creds.loginCustomerId) {
      headers["login-customer-id"] = normalizeCustomerId(creds.loginCustomerId);
    }

    const res = await fetch(
      `https://googleads.googleapis.com/${API_VERSION}/customers/${customerId}/googleAds:searchStream`,
      { method: "POST", headers, body: JSON.stringify({ query }) },
    );
    if (!res.ok) {
      throw new Error(
        `Google Ads API selhalo (${res.status}): ${(await res.text()).slice(0, 300)}`,
      );
    }
    // searchStream vrací POLE stream-chunků, každý s `results`.
    const chunks = (await res.json()) as SearchStreamChunk[];

    // Agregace na den: každý kanonický klíč zvlášť.
    const byDay = new Map<number, Record<string, number>>();
    for (const chunk of chunks) {
      for (const row of chunk.results ?? []) {
        const date = parseDateUtc(row.segments?.date);
        if (!date) continue;
        const dayMs = date.getTime();
        const agg = byDay.get(dayMs) ?? {};
        agg.cost = (agg.cost ?? 0) + Number(row.metrics?.costMicros ?? 0) / 1_000_000;
        agg.impressions = (agg.impressions ?? 0) + Number(row.metrics?.impressions ?? 0);
        agg.clicks = (agg.clicks ?? 0) + Number(row.metrics?.clicks ?? 0);
        agg.conversions = (agg.conversions ?? 0) + Number(row.metrics?.conversions ?? 0);
        byDay.set(dayMs, agg);
      }
    }

    // Tripwiry: první sync bez dat = chyba; inkrement bez dat = legitimní prázdno.
    if (byDay.size === 0) {
      if (isFirstSync) {
        throw new Error(
          "Google Ads nevrátil žádná data — zkontrolujte ID účtu, oprávnění a developer token.",
        );
      }
      return [];
    }

    const out: CanonicalMetric[] = [];
    for (const [dayMs, agg] of byDay) {
      const date = new Date(dayMs);
      for (const m of METRIC_KEYS) {
        out.push({ source: "google_ads", date, metric: m, value: agg[m] ?? 0 });
      }
    }
    return out;
  },
};

/** `YYYY-MM-DD` → Date (půlnoc UTC). */
function parseDateUtc(s: string | undefined): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}
