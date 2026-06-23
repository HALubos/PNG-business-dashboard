import ExcelJS from "exceljs";

// ── Výstupní typy parseru ───────────────────────────────────
export interface ParsedAvailability {
  domena: string;
  stock: number | null;
  availability: string | null;
  cena: number | null;
}

export interface ParsedProduct {
  ean: string;
  code: string | null;
  producer: string | null;
  nazev: string;
  size: string | null;
  kategorie: string | null;
  kategorieBreadcrumb: string | null;
  ourStock: number;
  salePrice: number | null;
  price: number | null;
  availabilities: ParsedAvailability[];
}

export interface ParsedImport {
  sheetName: string;
  datumExportu: Date;
  products: ParsedProduct[];
  domeny: string[]; // všechny unikátní domény (vč. vlastních e-shopů)
  pocetRadku: number;
  warnings: string[];
}

// ── Pomocné funkce pro čtení buněk ──────────────────────────
type CellValue = ExcelJS.CellValue;

function cellText(value: CellValue): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "1" : "0";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const v = value as unknown as Record<string, unknown>;
    if ("text" in v && v.text != null) return String(v.text).trim() || null;
    if ("result" in v && v.result != null) return String(v.result).trim() || null;
    if ("richText" in v && Array.isArray(v.richText)) {
      return (
        v.richText.map((t: { text?: string }) => t.text ?? "").join("").trim() ||
        null
      );
    }
    if ("hyperlink" in v && "text" in v) return String(v.text ?? "").trim() || null;
  }
  return null;
}

const NULLISH = new Set(["", "n/a", "na", "-", "—", "null"]);

function cellNumber(value: CellValue): number | null {
  const t = cellText(value);
  if (t === null || NULLISH.has(t.toLowerCase())) return null;
  // čísla mohou přijít s mezerami nebo čárkou jako desetinný oddělovač
  const n = Number(t.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Parsuje datum z názvu listu, např. „21.6.2026" → Date. */
function parseSheetDate(name: string): Date | null {
  const m = name.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  // UTC půlnoc — časově stabilní (jinak by se v UTC zobrazil předchozí den).
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  return Number.isNaN(date.getTime()) ? null : date;
}

// Názvy pevných sloupců (hledají se v hlavičce, ne natvrdo dle indexu).
const FIXED = {
  code: "code",
  producer: "producer",
  product: "product",
  size: "size",
  ean: "ean",
  category: "category",
  stock: "stock",
  salePrice: "sale price",
  price: "price",
} as const;

const FIXED_COLUMN_LIMIT = 10; // pevné sloupce 1–10, pak začínají bloky

/**
 * Naparsuje Price Check XLSX.
 * @param data buffer souboru (z uploadu nebo disku)
 */
export async function parsePriceCheck(
  data: ArrayBuffer | Buffer,
): Promise<ParsedImport> {
  const warnings: string[] = [];
  const wb = new ExcelJS.Workbook();
  // exceljs typuje load() jako Buffer, akceptuje ale i Uint8Array.
  // (Buffer je podtřída Uint8Array, takže pokryje i případ Bufferu.)
  const u8: Uint8Array =
    data instanceof Uint8Array ? data : new Uint8Array(data as ArrayBuffer);
  // exceljs typuje load() přísně jako Buffer; přetypujeme funkci, ať přijme Uint8Array.
  const loadFn = wb.xlsx.load.bind(wb.xlsx) as unknown as (
    d: Uint8Array,
  ) => Promise<unknown>;
  await loadFn(u8);

  const ws = wb.worksheets[0];
  if (!ws) throw new Error("Soubor neobsahuje žádný list.");

  const sheetName = ws.name;
  let datumExportu = parseSheetDate(sheetName);
  if (!datumExportu) {
    datumExportu = new Date();
    warnings.push(
      `Z názvu listu „${sheetName}" nešlo přečíst datum exportu — použito dnešní datum.`,
    );
  }

  // ── Hlavička ──────────────────────────────────────────────
  const header = ws.getRow(1);
  const headerText = (c: number) =>
    (cellText(header.getCell(c).value) ?? "").toLowerCase();

  // Mapování pevných sloupců podle názvu (jen v rozsahu 1–10).
  const fixedCol: Record<string, number> = {};
  for (let c = 1; c <= FIXED_COLUMN_LIMIT; c++) {
    const h = headerText(c);
    for (const [key, label] of Object.entries(FIXED)) {
      if (h === label && fixedCol[key] === undefined) fixedCol[key] = c;
    }
  }
  if (!fixedCol.ean) throw new Error("V hlavičce chybí sloupec EAN.");
  if (!fixedCol.product) throw new Error("V hlavičce chybí sloupec Product.");

  // ── Detekce opakujících se bloků odběratelů (každý 6 sloupců) ──
  // Blok je platný, dokud header[base+4]=="Stock" a [base+5]=="Availability".
  const blockBases: number[] = [];
  for (let base = FIXED_COLUMN_LIMIT + 1; base + 5 <= ws.columnCount; base += 6) {
    if (headerText(base + 4) === "stock" && headerText(base + 5) === "availability") {
      blockBases.push(base);
    } else {
      break; // dál už jsou souhrnné sloupce
    }
  }
  if (blockBases.length === 0) {
    warnings.push("Nenalezeny žádné bloky odběratelů — zkontrolujte formát souboru.");
  }

  // ── Data ──────────────────────────────────────────────────
  const products: ParsedProduct[] = [];
  const domeny = new Set<string>();
  let pocetRadku = 0;

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const ean = cellText(row.getCell(fixedCol.ean).value);
    const nazev = cellText(row.getCell(fixedCol.product).value);

    if (!ean) {
      // Řádek s názvem, ale bez EAN = upozornění; úplně prázdný řádek ignorujeme.
      if (nazev) warnings.push(`Řádek ${r}: chybí EAN — produkt „${nazev}" přeskočen.`);
      continue;
    }
    pocetRadku++;

    const availabilities: ParsedAvailability[] = [];
    const seenDomains = new Set<string>();
    for (const base of blockBases) {
      const domRaw = cellText(row.getCell(base + 1).value);
      if (!domRaw) continue; // nevyplněný blok
      const domena = domRaw.toLowerCase();
      if (seenDomains.has(domena)) continue; // duplicitní doména v jednom řádku
      seenDomains.add(domena);
      domeny.add(domena);

      availabilities.push({
        domena,
        cena: cellNumber(row.getCell(base).value),
        stock: cellNumber(row.getCell(base + 4).value),
        availability: cellText(row.getCell(base + 5).value),
      });
    }

    products.push({
      ean,
      code: fixedCol.code ? cellText(row.getCell(fixedCol.code).value) : null,
      producer: fixedCol.producer
        ? cellText(row.getCell(fixedCol.producer).value)
        : null,
      nazev: nazev ?? ean,
      size: fixedCol.size ? cellText(row.getCell(fixedCol.size).value) : null,
      kategorie: fixedCol.category
        ? cellText(row.getCell(fixedCol.category).value)
        : null,
      kategorieBreadcrumb: null,
      ourStock: fixedCol.stock ? cellNumber(row.getCell(fixedCol.stock).value) ?? 0 : 0,
      salePrice: fixedCol.salePrice
        ? cellNumber(row.getCell(fixedCol.salePrice).value)
        : null,
      price: fixedCol.price ? cellNumber(row.getCell(fixedCol.price).value) : null,
      availabilities,
    });
  }

  // Duplicitní EAN v rámci souboru (kvůli @@unique([snapshotId, ean]))
  const eanCounts = new Map<string, number>();
  for (const p of products) eanCounts.set(p.ean, (eanCounts.get(p.ean) ?? 0) + 1);
  const dupEans = [...eanCounts.entries()].filter(([, n]) => n > 1);
  if (dupEans.length) {
    warnings.push(
      `Duplicitní EAN (${dupEans.length}): ponechá se první výskyt — ${dupEans
        .slice(0, 5)
        .map(([e]) => e)
        .join(", ")}${dupEans.length > 5 ? "…" : ""}.`,
    );
  }

  return {
    sheetName,
    datumExportu,
    products,
    domeny: [...domeny],
    pocetRadku,
    warnings,
  };
}
