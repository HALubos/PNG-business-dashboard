import path from "node:path";
import ExcelJS from "exceljs";

// ─────────────────────────────────────────────────────────────
// Margin / PNO podklady per INTERNÍ kategorie značky z `PPC_nastavení.xlsx`
// (listy `Nastavení PPC_<Značka>`). Hlavička je na řádku s „Popisky řádků" (nahoře
// pár prázdných řádků → hledáme robustně). Sloupce: kategorie, Množství, Prodejní
// cena, (Průměrná) Marže (0–1), Breakeven_ROAS, AV zisk, a TŘI max-nabídky pro cíle
// ROAS 3,5 / 3,0 / 2,5 (faktor AV zisk × {0,30 / 0,33 / 0,40}).
//
// Použití v enginu: marže → break-even (tvrdý strop); zvolený ROAS sloupec → max CPA
// per kategorie. Fallback = celoznačková průměrná marže, když produkt kategorii nesedne.
// V lokálním prototypu se čte z `HEUREKA_MARGIN_PATH` (default data/sample/heureka/…).
// ─────────────────────────────────────────────────────────────

export interface CategoryMargin {
  category: string;
  marginPct: number; // 0–1
  avgProfit: number | null; // AV zisk
  maxCpa: { "3.5": number | null; "3.0": number | null; "2.5": number | null };
}

export interface MarginTable {
  byCategory: Map<string, CategoryMargin>; // klíč = lowercase název kategorie
  /** Celoznačková průměrná marže (fallback). */
  brandAvgMargin: number | null;
}

const EMPTY: MarginTable = { byCategory: new Map(), brandAvgMargin: null };

function cellNum(v: ExcelJS.CellValue): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "object" && "result" in v) {
    const r = (v as { result: unknown }).result;
    return typeof r === "number" && Number.isFinite(r) ? r : null;
  }
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function cellStr(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (typeof v === "object" && "result" in v)
    return String((v as { result: unknown }).result ?? "");
  if (typeof v === "object" && "text" in v) return String((v as { text: unknown }).text ?? "");
  return String(v);
}

function defaultPath(): string {
  return (
    process.env.HEUREKA_MARGIN_PATH ||
    path.join("data", "sample", "heureka", "PPC_nastavení.xlsx")
  );
}

const cache = new Map<string, MarginTable>();

/**
 * Načte (a nacachuje) margin tabulku pro projekt (dle klíče značky → list).
 * Vrací prázdnou tabulku, když soubor/list chybí (Acepac zatím nemá data).
 */
export async function loadMargins(
  projectKlic: string,
  filePath = defaultPath(),
): Promise<MarginTable> {
  const ck = `${filePath}::${projectKlic}`;
  const cached = cache.get(ck);
  if (cached) return cached;

  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.readFile(filePath);
  } catch {
    cache.set(ck, EMPTY);
    return EMPTY;
  }

  // List, jehož název obsahuje klíč značky (Nastavení PPC_Pinguin / _Activent).
  const klic = projectKlic.toLowerCase();
  let ws: ExcelJS.Worksheet | undefined;
  wb.eachSheet((sheet) => {
    if (!ws && sheet.name.toLowerCase().includes(klic)) ws = sheet;
  });
  if (!ws) {
    cache.set(ck, EMPTY);
    return EMPTY;
  }

  // Najdi řádek hlavičky (obsahuje buňku „Popisky řádků").
  let headerRow = -1;
  let nameCol = -1;
  for (let r = 1; r <= Math.min(ws.rowCount, 15); r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= Math.min(ws.columnCount, 14); c++) {
      if (cellStr(row.getCell(c).value).trim().toLowerCase().startsWith("popisky")) {
        headerRow = r;
        nameCol = c;
        break;
      }
    }
    if (headerRow > 0) break;
  }
  if (headerRow < 0) {
    cache.set(ck, EMPTY);
    return EMPTY;
  }

  // Zmapuj sloupce dle popisků hlavičky (tolerantně: Marže/Průměrná marže, AV/Av zisk).
  const hdr = ws.getRow(headerRow);
  let marginCol = -1;
  let profitCol = -1;
  const roasCols: Record<string, number> = {};
  for (let c = nameCol + 1; c <= ws.columnCount; c++) {
    const label = cellStr(hdr.getCell(c).value).trim().toLowerCase();
    if (marginCol < 0 && label.includes("marž")) marginCol = c;
    else if (profitCol < 0 && label.includes("zisk")) profitCol = c;
  }
  // Tři max-nabídky: hlavička je číslo cíle ROAS (3.5/3/2.5) v řádku NAD popisky.
  const roasHeaderRow = ws.getRow(headerRow - 1);
  for (let c = nameCol + 1; c <= ws.columnCount; c++) {
    const n = cellNum(roasHeaderRow.getCell(c).value);
    if (n === 3.5) roasCols["3.5"] = c;
    else if (n === 3) roasCols["3.0"] = c;
    else if (n === 2.5) roasCols["2.5"] = c;
  }

  const byCategory = new Map<string, CategoryMargin>();
  let brandAvgMargin: number | null = null;
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const name = cellStr(row.getCell(nameCol).value).trim();
    if (!name) continue;
    const margin = marginCol > 0 ? cellNum(row.getCell(marginCol).value) : null;
    if (name.toLowerCase().startsWith("celkový")) {
      // Celkový součet → celoznačková průměrná marže (fallback), řádek pak ignoruj.
      if (margin != null) brandAvgMargin = margin;
      continue;
    }
    if (name.toLowerCase() === "aov") continue;
    if (margin == null) continue;
    byCategory.set(name.toLowerCase(), {
      category: name,
      marginPct: margin,
      avgProfit: profitCol > 0 ? cellNum(row.getCell(profitCol).value) : null,
      maxCpa: {
        "3.5": roasCols["3.5"] ? cellNum(row.getCell(roasCols["3.5"]).value) : null,
        "3.0": roasCols["3.0"] ? cellNum(row.getCell(roasCols["3.0"]).value) : null,
        "2.5": roasCols["2.5"] ? cellNum(row.getCell(roasCols["2.5"]).value) : null,
      },
    });
  }

  const table: MarginTable = { byCategory, brandAvgMargin };
  cache.set(ck, table);
  return table;
}

/** Testovací reset cache. */
export function __resetMarginsCache(): void {
  cache.clear();
}

/** maxCPA pro zvolený cíl ROAS (klíč „3.5" | „3.0" | „2.5"). */
export function maxCpaForRoas(
  m: CategoryMargin | undefined,
  targetRoas: number,
): number | null {
  if (!m) return null;
  const key = targetRoas === 3.5 ? "3.5" : targetRoas === 2.5 ? "2.5" : "3.0";
  return m.maxCpa[key];
}
