// ─────────────────────────────────────────────────────────────
// Registr ZNÁMÝCH formátů feedu odběratele. Každý formát ví:
//  - `itemTag`: název opakujícího se elementu (pro streamové rozdělení),
//  - `extractItem(block)`: z JEDNOHO <item> bloku vytáhne {ean, stock, availability}
//    a dostupnost znormalizuje do NAŠEHO vokabuláře stavů.
// Žádný plný DOM — kvůli velkým feedům (80+ MB) se parsuje proudově po blocích.
// Přidání dalšího formátu = jedna položka v FEED_FORMATS.
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

export interface FeedFormat {
  key: FeedFormatKey;
  label: string;
  /** Element, na kterém se feed dělí na položky (default dle formátu; u „ostatni" z configu). */
  itemTag(config?: FeedConfig | null): string;
  /** Z jednoho bloku (`<item>…</item>`) vytáhne položku, nebo null (chybí EAN). */
  extractItem(block: string, config?: FeedConfig | null): NormalizedFeedItem | null;
}

// ── Pomocné funkce (regex nad JEDNÍM blokem — tagy jsou krátké/jednořádkové) ──
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
/** Obsah tagu z bloku (ošetří atributy i CDATA). */
function tag(block: string, name: string): string | null {
  const re = new RegExp(
    `<${escapeRe(name)}\\b[^>]*>([\\s\\S]*?)</${escapeRe(name)}>`,
    "i",
  );
  const m = re.exec(block);
  if (!m) return null;
  let v = m[1].trim();
  const cdata = /^<!\[CDATA\[([\s\S]*?)\]\]>$/.exec(v);
  if (cdata) v = cdata[1].trim();
  return v || null;
}
function toInt(v: string | null): number | null {
  if (v === null) return null;
  const n = Number(v.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

// ── Mapování dostupnosti do našich stavů (✏️ TODO doladit na vzorku) ──
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
  if (s === "out of stock") return "vyprodáno";
  if (s === "preorder" || s === "backorder") return "do týdne";
  return null; // neznámé → neuvedeno
}

// ── Formáty ─────────────────────────────────────────────────

const interni: FeedFormat = {
  key: "interni",
  label: "Interní (24gate)",
  itemTag: () => "entry",
  extractItem(block) {
    const ean = tag(block, "extra_EAN_EAN");
    if (!ean || ean === "-") return null;
    const stock = toInt(tag(block, "availability")); // číslo = ks
    // ks>0 → skladem · ks=0 → vyprodáno · chybí → neuvedeno
    const availability =
      stock === null ? null : stock > 0 ? "skladem" : "vyprodáno";
    return { ean, stock, availability };
  },
};

const heureka: FeedFormat = {
  key: "heureka",
  label: "Heureka XML",
  itemTag: () => "SHOPITEM",
  extractItem(block) {
    const ean = tag(block, "EAN");
    if (!ean) return null;
    const availability = mapHeureka(toInt(tag(block, "DELIVERY_DATE")));
    const stock = toInt(tag(block, "STOCK_QUANTITY")) ?? toInt(tag(block, "STOCK"));
    return { ean, stock, availability };
  },
};

const google: FeedFormat = {
  key: "google",
  label: "Google Merchant",
  itemTag: () => "item",
  extractItem(block) {
    const ean = tag(block, "g:gtin") ?? tag(block, "gtin");
    if (!ean) return null;
    const availability = mapGoogle(
      tag(block, "g:availability") ?? tag(block, "availability"),
    );
    const stock = toInt(tag(block, "g:quantity") ?? tag(block, "quantity"));
    return { ean, stock, availability };
  },
};

const ostatni: FeedFormat = {
  key: "ostatni",
  label: "Ostatní (ruční mapování)",
  itemTag: (config) => config?.itemPath ?? "item",
  extractItem(block, config) {
    if (!config?.eanField) return null;
    const ean = tag(block, config.eanField);
    if (!ean) return null;
    const stock = config.stockField ? toInt(tag(block, config.stockField)) : null;
    let availability = config.availabilityField
      ? tag(block, config.availabilityField)
      : null;
    if (!availability && stock !== null) availability = stock > 0 ? "skladem" : null;
    return { ean, stock, availability };
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
