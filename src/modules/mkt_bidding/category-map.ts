import { readFile } from "node:fs/promises";

// ─────────────────────────────────────────────────────────────
// Mapování produkt → INTERNÍ kategorie značky (kvůli marži). Marže jsou po interních
// kategoriích (Spací pytle, Batohy, Stany…), NE po Heureka `portal_category.id`.
// Mapujeme z `CATEGORYTEXT` feedu (např. „Heureka.cz | Sport | Kemping | Spací pytle").
//
// Postup: vezmi segmenty CATEGORYTEXT (dělené `|`), od nejspecifičtějšího (posledního)
// hledej shodu s názvem interní kategorie. Volitelný override (JSON) pro produkty,
// které nesednou. Fallback (null) → engine použije celoznačkovou průměrnou marži.
// ─────────────────────────────────────────────────────────────

export type CategoryOverrides = Record<string, string>; // segment/categoryText (lower) → interní kategorie

/** Rozdělí CATEGORYTEXT na očištěné segmenty (bez vedoucího „Heureka.cz"). */
export function categorySegments(categoryText: string | null | undefined): string[] {
  if (!categoryText) return [];
  return categoryText
    .split("|")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !/^heureka\.?(cz)?$/i.test(s));
}

/**
 * Namapuje produkt na interní kategorii. `known` = mapa lowercase → původní název
 * (z margin tabulky). Vrací původní název interní kategorie nebo null.
 */
export function mapToInternalCategory(
  categoryText: string | null | undefined,
  known: Map<string, string>,
  overrides: CategoryOverrides = {},
): string | null {
  const segments = categorySegments(categoryText);
  const fullLower = (categoryText ?? "").toLowerCase().trim();

  // 1) Override podle celého CATEGORYTEXT nebo podle segmentu.
  if (overrides[fullLower]) return overrides[fullLower];
  for (let i = segments.length - 1; i >= 0; i--) {
    const ov = overrides[segments[i].toLowerCase()];
    if (ov) return ov;
  }

  // 2) Shoda s názvem interní kategorie (od nejspecifičtějšího segmentu).
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i].toLowerCase();
    if (known.has(seg)) return known.get(seg)!;
    // částečná shoda (segment obsahuje kategorii nebo naopak)
    for (const [low, orig] of known) {
      if (seg === low || seg.includes(low) || low.includes(seg)) return orig;
    }
  }
  return null;
}

let overridesCache: CategoryOverrides | null = null;

/** Načte override mapu z JSON (HEUREKA_CATEGORY_MAP_PATH). Prázdná, když chybí. */
export async function loadCategoryOverrides(): Promise<CategoryOverrides> {
  if (overridesCache) return overridesCache;
  const p = process.env.HEUREKA_CATEGORY_MAP_PATH;
  if (!p) {
    overridesCache = {};
    return overridesCache;
  }
  try {
    const raw = await readFile(p, "utf8");
    const json = JSON.parse(raw) as Record<string, string>;
    const out: CategoryOverrides = {};
    for (const [k, v] of Object.entries(json)) out[k.toLowerCase().trim()] = v;
    overridesCache = out;
  } catch {
    overridesCache = {};
  }
  return overridesCache;
}

export function __resetCategoryOverridesCache(): void {
  overridesCache = null;
}
