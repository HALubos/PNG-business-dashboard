import type { ConnectorAdapter } from "../types";
import type { CanonicalMetric, CanonicalMetricKey } from "../metrics";
import { toDay } from "../metrics";
import { prisma } from "@/lib/prisma";
import { decryptJson, encryptJson } from "../crypto";
import {
  metaOAuthConfig,
  exchangeForLongLivedToken,
} from "../oauth/meta";

// ─────────────────────────────────────────────────────────────
// Meta Ads (Facebook / Instagram) — náklady, imprese, prokliky, konverze přes
// Marketing/Graph API insights (`/act_{id}/insights`, `time_increment=1`). OAuth
// API: dlouhodobý access token + adAccountId jsou ŠIFROVANĚ v
// `Connector.credentialsEnc` (připojení viz OAuth flow na /api/connectors/meta-ads/*).
//
// TOKEN: Meta nemá refresh token. Máme dlouhodobý token (~60 dní); při každém syncu
// ho BEST-EFFORT prodloužíme (`fb_exchange_token`) a uložíme → okno se posouvá a
// token nevyprší. Když prodloužení selže, sync pokračuje stávajícím tokenem; teprve
// expirovaný token při čtení dat shodí sync s jasnou hláškou „připojte znovu".
//
// INKREMENT × KOREKTNOST: insights vrací ÚPLNÉ denní agregáty → přepis `MetricFact`
// per den je vždy správný. Konverze se dorovnávají (atribuční okno) → re-fetch
// `TRAILING_REFETCH_DAYS` dnů zpět od cursoru. Cursor = nejnovější vrácený den.
// Backfill se stahuje po oknech (`WINDOW_DAYS`) kvůli rate-limitům a velikosti.
// Stránkování přes `paging.next`. Tripwiry jako u GA4/shoptetu.
//
// KONVERZE: Meta vrací `actions` (pole typů). Bereme nákupní konverze podle priority
// (`PURCHASE_ACTION_PRIORITY`) — per den první přítomný typ, aby se nesčítaly
// překrývající se typy (omni × offsite × pixel). Případně uprav dle svého trackingu.
// ─────────────────────────────────────────────────────────────

const GRAPH_VERSION = "v21.0";
const WINDOW_DAYS = 90; // backfill po oknech (insights limit / rate-limity)
const TRAILING_REFETCH_DAYS = 3; // konverze se dorovnávají zpětně
const REFRESH_BEFORE_MS = 7 * 24 * 60 * 60 * 1000; // prodluž token, když zbývá < 7 dní

// Priorita nákupních akcí (první přítomná se bere jako „konverze" daného dne).
const PURCHASE_ACTION_PRIORITY = [
  "omni_purchase",
  "offsite_conversion.fb_pixel_purchase",
  "purchase",
];

interface MetaCredentials {
  accessToken: string;
  adAccountId: string; // s/bez prefixu "act_"
  expiresAt?: string | null; // ISO; kdy dlouhodobý token vyprší (best-effort)
}

interface InsightsAction {
  action_type?: string;
  value?: string;
}

interface InsightsRow {
  date_start?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  actions?: InsightsAction[];
}

interface InsightsResponse {
  data?: InsightsRow[];
  paging?: { next?: string };
}

/** `act_123` ← číselné i prefixované ID. */
function normalizeAccountId(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, "");
  return digits ? `act_${digits}` : "";
}

/** Default backfill (když by `since` chybělo) — bez závislosti na sync.ts (cyklus). */
function backfillDefault(): Date {
  const raw = process.env.MARKETING_BACKFILL_FROM || "2025-01-01";
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? new Date("2025-01-01") : d;
}

/** `YYYY-MM-DD` → Date (půlnoc UTC). */
function parseDateUtc(s: string | undefined): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

function ymd(d: Date): string {
  return toDay(d).toISOString().slice(0, 10);
}

/** Nákupní konverze z `actions` dle priority (první přítomný typ). */
function purchaseConversions(actions: InsightsAction[] | undefined): number {
  if (!actions) return 0;
  for (const type of PURCHASE_ACTION_PRIORITY) {
    const hit = actions.find((a) => a.action_type === type);
    if (hit) return Number(hit.value ?? 0) || 0;
  }
  return 0;
}

/** Rozdělí [start, end] na okna ≤ WINDOW_DAYS. */
function dateWindows(start: Date, end: Date): { since: Date; until: Date }[] {
  const out: { since: Date; until: Date }[] = [];
  let cur = toDay(start);
  const last = toDay(end);
  while (cur.getTime() <= last.getTime()) {
    const until = new Date(cur);
    until.setUTCDate(until.getUTCDate() + WINDOW_DAYS - 1);
    out.push({ since: new Date(cur), until: until > last ? last : until });
    cur = new Date(until);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

const METRIC_KEYS: CanonicalMetricKey[] = [
  "cost",
  "impressions",
  "clicks",
  "conversions",
];

export const metaAdsAdapter: ConnectorAdapter = {
  type: "meta_ads",
  kind: "oauth_api",
  nazev: "Meta Ads",
  popis: "Náklady a výkon z Meta (Facebook / Instagram).",
  icon: "Megaphone",
  category: "reklama",

  async sync({ connector, since }): Promise<CanonicalMetric[]> {
    if (!connector.credentialsEnc) {
      throw new Error(
        "Meta Ads konektor nemá uložené přihlášení — připojte přes Meta.",
      );
    }
    const creds = decryptJson<MetaCredentials>(connector.credentialsEnc);
    const accountId = normalizeAccountId(creds.adAccountId ?? "");
    if (!accountId) {
      throw new Error("Meta Ads konektor nemá nastavené ID reklamního účtu.");
    }
    if (!creds.accessToken) {
      throw new Error("Meta Ads konektor nemá platný token — připojte znovu.");
    }

    // Best-effort prodloužení dlouhodobého tokenu (okno se posouvá → nevyprší).
    const accessToken = await maybeRefreshToken(connector.id, creds);

    const isFirstSync = !connector.cursor;
    const start = new Date(since ?? backfillDefault());
    start.setUTCDate(start.getUTCDate() - TRAILING_REFETCH_DAYS);
    const end = new Date();

    // Agregace na den: cost/impressions/clicks/conversions.
    const byDay = new Map<number, Record<string, number>>();

    for (const win of dateWindows(start, end)) {
      const params = new URLSearchParams({
        level: "account",
        time_increment: "1",
        fields: "spend,impressions,clicks,actions",
        time_range: JSON.stringify({ since: ymd(win.since), until: ymd(win.until) }),
        limit: "500",
        access_token: accessToken,
      });
      let url:
        | string
        | null = `https://graph.facebook.com/${GRAPH_VERSION}/${accountId}/insights?${params.toString()}`;

      // Stránkování přes `paging.next` (plné URL vrácené Metou).
      while (url) {
        const res = await fetch(url);
        if (!res.ok) {
          const body = (await res.text()).slice(0, 300);
          // 190 = token vypršel/odvolán → jasná výzva k reconnectu.
          if (res.status === 401 || /code\D*190/.test(body)) {
            throw new Error(
              "Meta token vypršel nebo byl odvolán — odpojte a připojte Meta Ads znovu.",
            );
          }
          throw new Error(`Meta insights selhalo (${res.status}): ${body}`);
        }
        const json = (await res.json()) as InsightsResponse;
        for (const row of json.data ?? []) {
          const date = parseDateUtc(row.date_start);
          if (!date) continue;
          const dayMs = date.getTime();
          const agg = byDay.get(dayMs) ?? {};
          agg.cost = (agg.cost ?? 0) + (Number(row.spend ?? 0) || 0);
          agg.impressions = (agg.impressions ?? 0) + (Number(row.impressions ?? 0) || 0);
          agg.clicks = (agg.clicks ?? 0) + (Number(row.clicks ?? 0) || 0);
          agg.conversions = (agg.conversions ?? 0) + purchaseConversions(row.actions);
          byDay.set(dayMs, agg);
        }
        url = json.paging?.next ?? null;
      }
    }

    // Tripwiry: první sync bez dat = chyba; inkrement bez dat = legitimní prázdno.
    if (byDay.size === 0) {
      if (isFirstSync) {
        throw new Error(
          "Meta nevrátila žádná data — zkontrolujte ID reklamního účtu a oprávnění.",
        );
      }
      return [];
    }

    const out: CanonicalMetric[] = [];
    for (const [dayMs, agg] of byDay) {
      const date = new Date(dayMs);
      for (const m of METRIC_KEYS) {
        out.push({ source: "meta_ads", date, metric: m, value: agg[m] ?? 0 });
      }
    }
    return out;
  },
};

/**
 * Prodlouží dlouhodobý token, blíží-li se expirace (best-effort — chyba prodloužení
 * NESHODÍ sync). Vrací použitelný access token (nový, nebo stávající). Nový token +
 * expiraci ULOŽÍ šifrovaně zpět do konektoru (mimo cursor/syncStatus, které řeší
 * runConnectorSync).
 */
async function maybeRefreshToken(
  connectorId: string,
  creds: MetaCredentials,
): Promise<string> {
  const expiresAt = creds.expiresAt ? new Date(creds.expiresAt).getTime() : null;
  const soon = expiresAt === null || expiresAt - Date.now() < REFRESH_BEFORE_MS;
  if (!soon) return creds.accessToken;

  const cfg = metaOAuthConfig();
  if (!cfg) return creds.accessToken; // bez app secretu prodloužit nelze

  try {
    const fresh = await exchangeForLongLivedToken(cfg, creds.accessToken);
    if (!fresh.access_token) return creds.accessToken;
    const newExpiresAt = fresh.expires_in
      ? new Date(Date.now() + fresh.expires_in * 1000).toISOString()
      : null;
    const credentialsEnc = encryptJson({
      ...creds,
      accessToken: fresh.access_token,
      expiresAt: newExpiresAt,
    } satisfies MetaCredentials);
    await prisma.connector
      .update({ where: { id: connectorId }, data: { credentialsEnc } })
      .catch(() => {});
    return fresh.access_token;
  } catch {
    return creds.accessToken; // necháme padnout až na čtení dat (pokud vyprší)
  }
}
