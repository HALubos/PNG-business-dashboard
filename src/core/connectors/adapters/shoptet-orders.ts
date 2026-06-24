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

const ORDER_TAG = "order";

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

/**
 * Z jednoho `<order>` bloku vytáhne datum objednávky a celkovou cenu vč. DPH.
 * Nejdřív odřízne `<orderItems>` (ceny položek by jinak kolidovaly s order-level
 * totalem). Názvy polí odpovídají exportu objednávek Shoptetu; bereme i běžné
 * alternativy (v repu není vzorový soubor, takže držíme tolerantní pořadí).
 */
function parseOrder(block: string): ParsedOrder | null {
  // Odřízni vnořené položky objednávky (jejich ceny/EANy nepatří do order totalu).
  const head = block.replace(/<orderItems>[\s\S]*?<\/orderItems>/i, "");

  const date = parseDate(
    tag(head, "creationTime") ?? tag(head, "date") ?? tag(head, "changeTime"),
  );
  if (!date) return null;

  // Order total vč. DPH: kontejner <price>/<totalPrice> → <withVat>, fallback <priceWithVat>.
  const priceBlock = tag(head, "price") ?? tag(head, "totalPrice");
  const revenue =
    (priceBlock ? toNum(tag(priceBlock, "withVat")) : null) ??
    toNum(tag(head, "priceWithVat"));
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
    const sinceDay = since ? toDay(since).getTime() : null;
    const url = since ? withUpdateTimeFrom(connector.feedUrl, since) : connector.feedUrl;

    // Agregace na den: revenue (suma cen vč. DPH) + conversions (počet objednávek).
    const byDay = new Map<number, { revenue: number; orders: number }>();
    for await (const block of streamFeedBlocks(url, ORDER_TAG)) {
      const order = parseOrder(block);
      if (!order) continue;
      const dayMs = toDay(order.date).getTime();
      // Dny starší než `since` jsou v inkrementu jen částečné → nepřepisuj je.
      if (sinceDay !== null && dayMs < sinceDay) continue;
      const agg = byDay.get(dayMs) ?? { revenue: 0, orders: 0 };
      agg.revenue += order.revenue;
      agg.orders += 1;
      byDay.set(dayMs, agg);
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
