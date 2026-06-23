import { XMLParser } from "fast-xml-parser";

export interface FeedItem {
  ean: string;
  stock: number; // availability — ks aktuálně skladem
  stock7d: number; // availability7d — příjem do 7 dnů
}

export interface ParsedFeed {
  items: FeedItem[];
  warnings: string[];
}

// parseTagValue:false → hodnoty zůstanou stringy (EAN se nepřevede na číslo a neztratí
// se přesnost); čísla parsujeme sami přes toInt. CDATA fast-xml-parser zploští do textu.
const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  trimValues: true,
});

function toInt(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const n = Number(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

/** Naparsuje XML feed skladovosti → položky {ean, stock, stock7d}. */
export function parseStockFeed(xml: string): ParsedFeed {
  const warnings: string[] = [];

  const doc = parser.parse(xml) as {
    feed?: { entry?: unknown };
  };
  const rawEntries = doc?.feed?.entry;
  const entries: Array<Record<string, unknown>> = Array.isArray(rawEntries)
    ? (rawEntries as Array<Record<string, unknown>>)
    : rawEntries
      ? [rawEntries as Record<string, unknown>]
      : [];

  if (entries.length === 0) {
    warnings.push("Feed neobsahuje žádné položky <entry> — zkontrolujte URL.");
    return { items: [], warnings };
  }

  const items: FeedItem[] = [];
  const seen = new Set<string>();
  let bezEan = 0;
  for (const e of entries) {
    const eanRaw = e["extra_EAN_EAN"];
    const ean = eanRaw != null ? String(eanRaw).trim() : "";
    if (!ean || ean === "-") {
      bezEan++;
      continue;
    }
    if (seen.has(ean)) continue; // duplicitní EAN — první výskyt vyhrává
    seen.add(ean);
    items.push({
      ean,
      stock: toInt(e["availability"]),
      stock7d: toInt(e["availability7d"]),
    });
  }

  if (bezEan > 0) warnings.push(`${bezEan} položek feedu bez EAN — přeskočeno.`);
  if (items.length === 0)
    warnings.push("Z feedu nebyl načten žádný EAN.");

  return { items, warnings };
}
