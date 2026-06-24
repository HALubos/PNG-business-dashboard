import type { ConnectorAdapter } from "../types";
import type { CanonicalMetric } from "../metrics";
import { toDay } from "../metrics";
import { streamFeedBlocks } from "@/modules/resellers/feed/feed-stream";

// ─────────────────────────────────────────────────────────────
// Shoptet — objednávky → denní tržby (autoritativní zdroj revenue, proto
// `overridesRevenue`). Zdroj = permanentní URL exportu s autorizačním hashem
// (volitelně omezená na IP). Inkrement přes `&updateTimeFrom=YYYY-MM-DD`.
//
// Parsuje se PROUDOVĚ (`streamFeedBlocks`, bez DOM, vzor `feed-stream.ts`),
// agreguje na DENNÍ granularitu → `MetricFact` (`revenue` = suma cen vč. DPH,
// `conversions` = počet objednávek za den).
//
// INKREMENT × KOREKTNOST (důležité):
// `runConnectorSync` ukládá denní metriky přepisem (`update: { value }`). Aby
// inkrement (jen změněné objednávky) nepřepsal denní součet jen částí dat,
// emitujeme metriky JEN pro dny `>= since`. Klíč: objednávka s datem dne D má
// `updateTime >= creationTime >= D 00:00`, takže `updateTimeFrom=D` vrátí VŠECHNY
// objednávky všech dnů `>= D` → tyto dny jsou pokryté úplně a přepis je správný.
// Starší dny (objednávka z minulosti se „dotkla" změnou stavu) se ve výsledku
// objeví částečně → ty zahazujeme (už byly spočtené v dřívějším syncu). Při
// prvním připojení je `since` = backfill, takže se spočítá celá historie.
// (Pozn.: pozdější změna CENY u objednávky starší než cursor se tím nepromítne —
// pro přesné přepočty by byla potřeba per-objednávková tabulka; mimo rozsah MVP.)
// ─────────────────────────────────────────────────────────────

// Shoptet order export: kořen <ORDERS>, položka <ORDER> (VELKÝMI). Lookahead
// `[\s/>]` ve streamFeedBlocks odliší <ORDER> od <ORDER_ID>/<ORDER_ITEMS>.
const ORDER_TAG = "ORDER";

/** Obsah tagu z bloku (ošetří atributy i CDATA). Krátké, jednoúrovňové tagy. */
function tag(block: string, name: string): string | null {
  const re = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, "i");
  const m = re.exec(block);
  if (!m) return null;
  let v = m[1].trim();
  const cdata = /^<!\[CDATA\[([\s\S]*?)\]\]>$/.exec(v);
  if (cdata) v = cdata[1].trim();
  return v || null;
}

/** Číslo z textu (toleruje mezery a desetinnou čárku). */
function toNum(v: string | null): number | null {
  if (v === null) return null;
  const n = Number(v.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Datum z Shoptet formátu (ISO, „YYYY-MM-DD HH:MM:SS" i samotné „YYYY-MM-DD"). */
function parseDate(v: string | null): Date | null {
  if (!v) return null;
  // „2024-01-15 10:30:00" → ISO (jinak by se v některých enginech parsovalo lokálně/NaN).
  const iso = v.trim().replace(" ", "T");
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

interface ParsedOrder {
  date: Date;
  revenue: number;
}

// Pod-stromy objednávky, které mají VLASTNÍ cenu (`<TOTAL_PRICE>`/`<UNIT_PRICE>` u
// položek apod.). Odřízneme je, aby zbylé order-level `<TOTAL_PRICE>` nešlo zaměnit
// s cenou položky/dopravy. V Shoptet šabloně je klíčový `<ORDER_ITEMS>` (každý
// `<ITEM>` má vlastní `<TOTAL_PRICE><WITH_VAT>`); ostatní jsou fallbacky pro jiné
// šablony. (`tag()` je case-insensitive, ale názvy musí sedět — proto VELKÁ s `_`.)
const NESTED_PRICE_CONTAINERS = [
  "ORDER_ITEMS", // Shoptet: obal položek objednávky
  "ITEM", // jednotlivá položka (kdyby byla bez obalu)
  // fallbacky pro odlišné šablony:
  "shipping",
  "billing",
  "payment",
  "discount",
];

/** Odřízne vnořené pod-stromy nesoucí vlastní cenu (viz výše). */
function stripNestedPrices(block: string): string {
  let s = block;
  for (const c of NESTED_PRICE_CONTAINERS) {
    s = s.replace(new RegExp(`<${c}\\b[^>]*>[\\s\\S]*?</${c}>`, "gi"), "");
  }
  return s;
}

/**
 * Celková cena objednávky vč. DPH. Preferuje EXPLICITNÍ celková pole, teprve pak
 * obecný `<price>` (po odříznutí pod-stromů by měl být už jen order-level).
 */
function orderTotalWithVat(head: string): number | null {
  // 1) Shoptet: <TOTAL_PRICE><WITH_VAT>…</WITH_VAT></TOTAL_PRICE> = celek objednávky.
  //    (`WITH_VAT` se s `WITHOUT_VAT` neplete — `<WITH_VAT` literal v `<WITHOUT_VAT>` není.)
  const total = tag(head, "TOTAL_PRICE");
  if (total) {
    const v = toNum(tag(total, "WITH_VAT"));
    if (v !== null) return v;
  }
  // 2) fallbacky pro jiné šablony: ploché pole, pak obecný <price>.
  const flat = toNum(tag(head, "priceWithVat") ?? tag(head, "totalWithVat"));
  if (flat !== null) return flat;
  const price = tag(head, "price");
  if (price) {
    const v = toNum(tag(price, "withVat"));
    if (v !== null) return v;
  }
  return null;
}

/**
 * Z jednoho `<ORDER>` bloku vytáhne datum objednávky a celkovou cenu vč. DPH.
 * Nejdřív odřízne pod-stromy s vlastní cenou (položky/doprava/platba/slevy), pak
 * čte order-level total. Názvy polí odpovídají exportu objednávek Shoptetu;
 * bereme i běžné alternativy (v repu není vzorový soubor → tolerantní pořadí).
 */
function parseOrder(block: string): ParsedOrder | null {
  const head = stripNestedPrices(block);

  const date = parseDate(
    tag(head, "DATE") ?? tag(head, "creationTime") ?? tag(head, "changeTime"),
  );
  if (!date) return null;

  const revenue = orderTotalWithVat(head);
  if (revenue === null) return null;

  return { date, revenue };
}

/** Připojí `&updateTimeFrom=YYYY-MM-DD` k permanentní URL (která už má `?hash=`). */
function withUpdateTimeFrom(feedUrl: string, since: Date): string {
  const day = toDay(since).toISOString().slice(0, 10);
  const sep = feedUrl.includes("?") ? "&" : "?";
  return `${feedUrl}${sep}updateTimeFrom=${day}`;
}

export const shoptetOrdersAdapter: ConnectorAdapter = {
  type: "shoptet_orders",
  kind: "url_feed",
  nazev: "Shoptet",
  popis: "Objednávky a tržby z Shoptetu (permanentní URL s hashem).",
  icon: "ShoppingCart",
  category: "eshop_trzby",
  overridesRevenue: true,

  async sync({ connector, since }): Promise<CanonicalMetric[]> {
    if (!connector.feedUrl) {
      throw new Error("Shoptet konektor nemá nastavenou URL exportu objednávek.");
    }
    // `since` je vždy Date (cursor nebo backfill). Inkrement i 15min limit Shoptetu
    // řešíme tím, že VŽDY stahujeme přes `updateTimeFrom`.
    const isFirstSync = !connector.cursor;
    const sinceDay = since ? toDay(since).getTime() : null;
    const url = since ? withUpdateTimeFrom(connector.feedUrl, since) : connector.feedUrl;

    // Agregace na den: revenue (suma cen vč. DPH) + conversions (počet objednávek).
    const byDay = new Map<number, { revenue: number; orders: number }>();
    let scanned = 0; // počet <ORDER> bloků ve feedu
    let parsed = 0; // z toho úspěšně načtených (datum + cena)
    for await (const block of streamFeedBlocks(url, ORDER_TAG)) {
      scanned++;
      const order = parseOrder(block);
      if (!order) continue;
      parsed++;
      const dayMs = toDay(order.date).getTime();
      // Dny starší než `since` jsou v inkrementu jen částečné → nepřepisuj je.
      if (sinceDay !== null && dayMs < sinceDay) continue;
      const agg = byDay.get(dayMs) ?? { revenue: 0, orders: 0 };
      agg.revenue += order.revenue;
      agg.orders += 1;
      byDay.set(dayMs, agg);
    }

    // Tripwiry proti TICHÉMU „ok" nad rozbitým feedem (vzor `processResellerFeed`,
    // které hází na scanned===0). Inkrement smí legitimně vrátit 0 objednávek (nic se
    // nezměnilo od cursoru), proto rozlišujeme první sync od inkrementu:
    if (scanned === 0) {
      if (isFirstSync) {
        throw new Error(
          "Feed nevrátil žádné objednávky (element <ORDER>) — zkontrolujte formát exportu a URL.",
        );
      }
      return []; // inkrement: nic nového od posledního cursoru
    }
    if (parsed === 0) {
      throw new Error(
        `Feed vrátil ${scanned} objednávek, ale žádnou se nepodařilo načíst — zkontrolujte mapování polí (datum, cena vč. DPH).`,
      );
    }

    const out: CanonicalMetric[] = [];
    for (const [dayMs, agg] of byDay) {
      const date = new Date(dayMs);
      out.push({ source: "shoptet_orders", date, metric: "revenue", value: agg.revenue });
      out.push({ source: "shoptet_orders", date, metric: "conversions", value: agg.orders });
    }
    return out;
  },
};
