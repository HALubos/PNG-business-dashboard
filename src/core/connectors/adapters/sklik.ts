import type { ConnectorAdapter } from "../types";
import type { CanonicalMetric, CanonicalMetricKey } from "../metrics";
import { toDay } from "../metrics";
import { decryptJson } from "../crypto";

// ─────────────────────────────────────────────────────────────
// Sklik (Seznam.cz) — náklady, imprese, prokliky, konverze. Sklik API je
// TOKEN-BASED (ne OAuth roundtrip): přihlásíš se API tokenem (`client.loginByToken`)
// → session, kterou nosíš v dalších voláních. Token zadává člověk v Integraci
// (per projekt) a ukládá se ŠIFROVANĚ v `Connector.credentialsEnc`; fallback je
// `.env` `SKLIK_API_TOKEN`. `kind` zůstává `oauth_api` (credentials-based konektor).
//
// STATISTIKY: report flow — `campaigns.createReport` (restrictionFilter dateFrom/
// dateTo, granularita „daily") → `campaigns.readReport` (stránkováno offset/limit).
// Agregujeme přes kampaně na DENNÍ granularitu. Peníze jsou v HALÉŘÍCH → ÷100 = CZK.
//
// INKREMENT × KOREKTNOST: denní agregáty jsou úplné → přepis `MetricFact` per den
// je správný; konverze se dorovnávají → re-fetch `TRAILING_REFETCH_DAYS` zpět.
// Cursor = nejnovější den. Tripwiry jako u ostatních adaptérů.
//
// ⚠️ V repu není reálný Sklik účet — názvy polí (totalMoney/clicks/impressions/
// conversions, struktura stats) jsou dle dokumentace Sklik API; ověř na reálném
// účtu a případně uprav `readStatRow` / `displayColumns`.
// ─────────────────────────────────────────────────────────────

const API_BASE = "https://api.sklik.cz/drak/json";
const PAGE_LIMIT = 100; // kampaní na stránku readReportu
const TRAILING_REFETCH_DAYS = 3;

interface SklikCredentials {
  apiToken: string;
  accountId?: string; // userId účtu (agenturní přístup) — volitelné
}

/** Obecná Sklik odpověď: status 200 = ok, jinak chyba; session se „roluje" dál. */
interface SklikResponse {
  status?: number;
  statusMessage?: string;
  session?: string;
  reportId?: string;
  totalCount?: number;
  report?: SklikReportRow[];
}

interface SklikStat {
  date?: string; // „YYYY-MM-DD" (daily granularita)
  impressions?: number;
  clicks?: number;
  totalMoney?: number; // haléře
  money?: number; // fallback (haléře)
  conversions?: number;
}

interface SklikReportRow {
  stats?: SklikStat[];
}

/** Jedno volání Sklik API. `args` = pole argumentů (JSON-RPC styl). Hází na status≠200. */
async function sklikCall(method: string, args: unknown[]): Promise<SklikResponse> {
  const res = await fetch(`${API_BASE}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    throw new Error(
      `Sklik ${method} selhalo (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}`,
    );
  }
  const json = (await res.json()) as SklikResponse;
  if (json.status && json.status !== 200) {
    throw new Error(`Sklik ${method} vrátil status ${json.status}: ${json.statusMessage ?? ""}`);
  }
  return json;
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

const METRIC_KEYS: CanonicalMetricKey[] = [
  "cost",
  "impressions",
  "clicks",
  "conversions",
];

export const sklikAdapter: ConnectorAdapter = {
  type: "sklik",
  kind: "oauth_api",
  nazev: "Sklik",
  popis: "Náklady a prokliky ze Skliku (Seznam.cz).",
  icon: "Megaphone",
  category: "reklama",

  async sync({ connector, since }): Promise<CanonicalMetric[]> {
    if (!connector.credentialsEnc) {
      throw new Error("Sklik konektor nemá uložený API token — připojte v Integraci.");
    }
    const creds = decryptJson<SklikCredentials>(connector.credentialsEnc);
    const apiToken = creds.apiToken || process.env.SKLIK_API_TOKEN || "";
    if (!apiToken) {
      throw new Error("Sklik konektor nemá API token (ani SKLIK_API_TOKEN v .env).");
    }

    const isFirstSync = !connector.cursor;
    const start = new Date(since ?? backfillDefault());
    start.setUTCDate(start.getUTCDate() - TRAILING_REFETCH_DAYS);
    const end = new Date();

    // 1) Přihlášení tokenem → session (nosí se dál; volitelně userId pro agentury).
    const login = await sklikCall("client.loginByToken", [apiToken]);
    let session = login.session;
    if (!session) throw new Error("Sklik nevrátil session (neplatný API token?).");
    const authArg: Record<string, string> = { session };
    if (creds.accountId) authArg.userId = creds.accountId;

    // 2) Vytvoř report (denní granularita, dané období).
    const report = await sklikCall("campaigns.createReport", [
      authArg,
      { dateFrom: ymd(start), dateTo: ymd(end) },
      { statGranularity: "daily" },
    ]);
    if (report.session) session = report.session;
    authArg.session = session;
    const reportId = report.reportId;
    if (!reportId) {
      // Žádný report → žádné kampaně/data. První sync = chyba, jinak prázdno.
      if (isFirstSync) {
        throw new Error("Sklik nevrátil report — zkontrolujte API token a účet.");
      }
      return [];
    }

    // 3) Čti report po stránkách, agreguj přes kampaně na den. Konec se pozná podle
    //    VELIKOSTI stránky (krátká/prázdná stránka = poslední) — NEspoléháme na
    //    `report.totalCount`: kdyby chybělo/bylo 0, smyčka řízená `offset < totalCount`
    //    by skončila po 1. stránce a kampaně nad PAGE_LIMIT by se tiše ztratily.
    const byDay = new Map<number, Record<string, number>>();
    let offset = 0;
    for (;;) {
      const page = await sklikCall("campaigns.readReport", [
        authArg,
        reportId,
        {
          offset,
          limit: PAGE_LIMIT,
          allowEmptyStatistics: false,
          displayColumns: ["impressions", "clicks", "totalMoney", "conversions"],
          statGranularity: "daily",
        },
      ]);
      if (page.session) authArg.session = page.session;
      const rows = page.report ?? [];
      for (const row of rows) {
        for (const stat of row.stats ?? []) {
          const date = parseDateUtc(stat.date);
          if (!date) continue;
          const dayMs = date.getTime();
          const agg = byDay.get(dayMs) ?? {};
          agg.cost = (agg.cost ?? 0) + (Number(stat.totalMoney ?? stat.money ?? 0) || 0) / 100;
          agg.impressions = (agg.impressions ?? 0) + (Number(stat.impressions ?? 0) || 0);
          agg.clicks = (agg.clicks ?? 0) + (Number(stat.clicks ?? 0) || 0);
          agg.conversions = (agg.conversions ?? 0) + (Number(stat.conversions ?? 0) || 0);
          byDay.set(dayMs, agg);
        }
      }
      if (rows.length < PAGE_LIMIT) break; // poslední (i prázdná) stránka
      offset += PAGE_LIMIT;
    }

    // Tripwiry: první sync bez dat = chyba; inkrement bez dat = legitimní prázdno.
    if (byDay.size === 0) {
      if (isFirstSync) {
        throw new Error("Sklik nevrátil žádná data — zkontrolujte účet a oprávnění tokenu.");
      }
      return [];
    }

    const out: CanonicalMetric[] = [];
    for (const [dayMs, agg] of byDay) {
      const date = new Date(dayMs);
      for (const m of METRIC_KEYS) {
        out.push({ source: "sklik", date, metric: m, value: agg[m] ?? 0 });
      }
    }
    return out;
  },
};
