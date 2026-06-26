import { readFile } from "node:fs/promises";
import path from "node:path";

// ─────────────────────────────────────────────────────────────
// Ceník prokliků Heureka = FLOOR CPC (spodní mez). Soubor `cenik-standard-cz.csv`
// (oddělovač `;`): 1. sl. `sekceId` (== portal_category.id), 2. `sekce`, dál sloupce
// = cenová pásma produktu (`0.00-20.00` … `500000.01-`); buňka = základní CPC pro
// kategorii × pásmo. floorCpc(sekceId, price) = CPC v řádku sekce a pásmu dle ceny.
//
// Soubor je referenční (veřejný ceník Heureky), v lokálním prototypu se čte z cesty
// `HEUREKA_PRICELIST_PATH` (default data/sample/heureka/cenik-standard-cz.csv).
// ─────────────────────────────────────────────────────────────

interface PriceBand {
  min: number;
  max: number; // Infinity pro otevřené poslední pásmo
}

export interface PriceList {
  bands: PriceBand[];
  /** sekceId → CPC hodnoty per pásmo (index do `bands`). */
  bySection: Map<number, number[]>;
}

function parseBand(label: string): PriceBand | null {
  const m = /^([\d.]+)\s*-\s*([\d.]*)$/.exec(label.trim());
  if (!m) return null;
  const min = Number(m[1]);
  const max = m[2] === "" ? Infinity : Number(m[2]);
  if (!Number.isFinite(min)) return null;
  return { min, max };
}

function defaultPath(): string {
  return (
    process.env.HEUREKA_PRICELIST_PATH ||
    path.join("data", "sample", "heureka", "cenik-standard-cz.csv")
  );
}

let cache: PriceList | null = null;

/** Načte (a nacachuje) ceník floor CPC. Vrací prázdný ceník, když soubor chybí. */
export async function loadPriceList(filePath = defaultPath()): Promise<PriceList> {
  if (cache) return cache;
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch {
    cache = { bands: [], bySection: new Map() };
    return cache;
  }

  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    cache = { bands: [], bySection: new Map() };
    return cache;
  }

  const header = lines[0].split(";");
  // Pásma jsou sloupce od indexu 2 dál.
  const bands: PriceBand[] = [];
  const bandColIdx: number[] = [];
  for (let i = 2; i < header.length; i++) {
    const b = parseBand(header[i]);
    if (b) {
      bands.push(b);
      bandColIdx.push(i);
    }
  }

  const bySection = new Map<number, number[]>();
  for (let r = 1; r < lines.length; r++) {
    const cols = lines[r].split(";");
    const sekceId = Number(cols[0]);
    if (!Number.isFinite(sekceId)) continue;
    const values = bandColIdx.map((ci) => {
      const n = Number((cols[ci] ?? "").replace(",", "."));
      return Number.isFinite(n) ? n : 0;
    });
    bySection.set(sekceId, values);
  }

  cache = { bands, bySection };
  return cache;
}

/** Testovací reset cache (jinak proces drží ceník napořád). */
export function __resetPriceListCache(): void {
  cache = null;
}

/** Floor CPC pro danou sekci a cenu (Kč). null = sekce/ceník chybí. */
export function floorCpcFor(
  list: PriceList,
  sekceId: number | null | undefined,
  price: number | null | undefined,
): number | null {
  if (sekceId == null) return null;
  const row = list.bySection.get(sekceId);
  if (!row || list.bands.length === 0) return null;
  const p = price ?? 0;
  let idx = list.bands.findIndex((b) => p >= b.min && p <= b.max);
  if (idx === -1) idx = list.bands.length - 1; // nad poslední pásmo → poslední
  const cpc = row[idx];
  return Number.isFinite(cpc) ? cpc : null;
}
