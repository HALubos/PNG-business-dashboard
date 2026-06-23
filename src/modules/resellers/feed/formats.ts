import { XMLParser } from "fast-xml-parser";

// ─────────────────────────────────────────────────────────────
// Registr ZNÁMÝCH formátů feedu odběratele. Preset = normalizér, který ze své
// struktury vytáhne {ean, stock, availability} a dostupnost znormalizuje do
// NAŠEHO vokabuláře stavů (skladem / do 3 dnů / do týdne / two_weeks / do měsíce /
// info v obchodu / null), aby porovnání s StockConfig.availableStates fungovalo.
// Přidání dalšího formátu = jedna položka v FEED_FORMATS (stejná modularita).
// ─────────────────────────────────────────────────────────────

export type FeedFormatKey = "interni" | "heureka" | "google" | "ostatni";

// Ruční mapování — relevantní jen pro formát "ostatni".
export interface FeedConfig {
  itemPath: string; // opakující se element, např. "SHOPITEM" / "item" / "entry"
  eanField: string; // tag s EANem
  stockField?: string; // tag s počtem ks (volitelné)
  availabilityField?: string; // tag s textovým stavem (volitelné)
}

export interface NormalizedFeedItem {
  ean: string;
  stock: number | null;
  availability: string | null;
}
export interface NormalizeResult {
  items: NormalizedFeedItem[];
  warnings: string[];
}

export interface FeedFormat {
  key: FeedFormatKey;
  label: string;
  normalize(xml: string, config?: FeedConfig | null): NormalizeResult;
}

// ── Pomocné funkce ──────────────────────────────────────────
const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  trimValues: true,
});

type XmlNode = Record<string, unknown>;

function text(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "object") {
    const o = v as XmlNode;
    if (o["#text"] != null) return String(o["#text"]).trim() || null;
  }
  return null;
}
function toInt(v: unknown): number | null {
  const t = text(v);
  if (t === null) return null;
  const n = Number(t.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.trunc(n) : null;
}
function asArray(v: unknown): XmlNode[] {
  if (v === null || v === undefined) return [];
  const arr = Array.isArray(v) ? v : [v];
  return arr.filter((x): x is XmlNode => !!x && typeof x === "object");
}
// Najde opakující se položky dle názvu elementu kdekoli ve stromu (BFS).
function findItems(doc: unknown, itemKey: string): XmlNode[] {
  const stack: unknown[] = [doc];
  while (stack.length) {
    const node = stack.shift();
    if (node && typeof node === "object") {
      const obj = node as XmlNode;
      if (itemKey in obj) return asArray(obj[itemKey]);
      for (const k of Object.keys(obj)) {
        const val = obj[k];
        if (val && typeof val === "object") stack.push(val);
      }
    }
  }
  return [];
}

// ── Mapování dostupnosti do našich stavů (✏️ TODO doladit na reálném vzorku) ──
function mapHeureka(deliveryDate: number | null): string | null {
  if (deliveryDate === null) return null;
  if (deliveryDate <= 0) return "skladem";
  if (deliveryDate <= 3) return "do 3 dnů";
  if (deliveryDate <= 7) return "do týdne";
  if (deliveryDate <= 14) return "two_weeks";
  return "do měsíce";
}
function mapGoogle(v: string | null): string | null {
  if (!v) return null;
  const s = v.toLowerCase().replace(/[_\s]+/g, " ").trim();
  if (s === "in stock") return "skladem";
  if (s === "preorder" || s === "backorder") return "do týdne";
  return null; // out of stock / neznámé → nedostupné
}

// ── Normalizéry ─────────────────────────────────────────────

// Interní formát (24gate): <feed><entry> … extra_EAN_EAN / availability (= ks).
const interni: FeedFormat = {
  key: "interni",
  label: "Interní (24gate)",
  normalize(xml) {
    const warnings: string[] = [];
    const entries = findItems(parser.parse(xml), "entry");
    if (!entries.length) warnings.push("Nenalezeny položky <entry>.");
    const items: NormalizedFeedItem[] = [];
    for (const e of entries) {
      const ean = text(e["extra_EAN_EAN"]);
      if (!ean || ean === "-") continue;
      const stock = toInt(e["availability"]); // číslo = ks
      const availability = stock !== null && stock > 0 ? "skladem" : null;
      items.push({ ean, stock, availability });
    }
    return { items, warnings };
  },
};

// Heureka XML: <SHOPITEM> … <EAN>, dostupnost přes <DELIVERY_DATE> (dny).
const heureka: FeedFormat = {
  key: "heureka",
  label: "Heureka XML",
  normalize(xml) {
    const warnings: string[] = [];
    const rows = findItems(parser.parse(xml), "SHOPITEM");
    if (!rows.length) warnings.push("Nenalezeny položky <SHOPITEM>.");
    const items: NormalizedFeedItem[] = [];
    for (const it of rows) {
      const ean = text(it["EAN"]);
      if (!ean) continue;
      const availability = mapHeureka(toInt(it["DELIVERY_DATE"]));
      const stock = toInt(it["STOCK_QUANTITY"]) ?? toInt(it["STOCK"]); // Heureka ks často nemá
      items.push({ ean, stock, availability });
    }
    return { items, warnings };
  },
};

// Google Merchant: <item> … <g:gtin>, <g:availability>, příp. <g:quantity>.
const google: FeedFormat = {
  key: "google",
  label: "Google Merchant",
  normalize(xml) {
    const warnings: string[] = [];
    const rows = findItems(parser.parse(xml), "item");
    if (!rows.length) warnings.push("Nenalezeny položky <item>.");
    const items: NormalizedFeedItem[] = [];
    for (const it of rows) {
      const ean = text(it["g:gtin"]) ?? text(it["gtin"]);
      if (!ean) continue;
      const availability = mapGoogle(
        text(it["g:availability"]) ?? text(it["availability"]),
      );
      const stock = toInt(it["g:quantity"]) ?? toInt(it["quantity"]);
      items.push({ ean, stock, availability });
    }
    return { items, warnings };
  },
};

// Ostatní: neznámý formát → ruční mapování z feedConfig.
const ostatni: FeedFormat = {
  key: "ostatni",
  label: "Ostatní (ruční mapování)",
  normalize(xml, config) {
    const warnings: string[] = [];
    if (!config?.itemPath || !config?.eanField) {
      warnings.push("Chybí feedConfig (itemPath / eanField) pro formát Ostatní.");
      return { items: [], warnings };
    }
    const rows = findItems(parser.parse(xml), config.itemPath);
    if (!rows.length) warnings.push(`Nenalezeny položky <${config.itemPath}>.`);
    const items: NormalizedFeedItem[] = [];
    for (const r of rows) {
      const ean = text(r[config.eanField]);
      if (!ean) continue;
      const stock = config.stockField ? toInt(r[config.stockField]) : null;
      let availability = config.availabilityField
        ? text(r[config.availabilityField])
        : null;
      if (!availability && stock !== null) availability = stock > 0 ? "skladem" : null;
      items.push({ ean, stock, availability });
    }
    return { items, warnings };
  },
};

const BY_KEY: Record<FeedFormatKey, FeedFormat> = {
  interni,
  heureka,
  google,
  ostatni,
};

export const FEED_FORMATS: FeedFormat[] = [interni, heureka, google, ostatni];
export const DEFAULT_FEED_FORMAT: FeedFormatKey = "interni";

export function getFeedFormat(key: string | null | undefined): FeedFormat {
  return BY_KEY[(key as FeedFormatKey) ?? DEFAULT_FEED_FORMAT] ?? BY_KEY.interni;
}
