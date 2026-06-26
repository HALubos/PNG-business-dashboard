import ExcelJS from "exceljs";

import type { BiddingProposal } from "../engine";

// ─────────────────────────────────────────────────────────────
// Output adaptér „ebrana" — zapíše navržené Heureka CPC do importního formátu
// ebrana (plný produktový update). Klíč = sloupec „Unikátní kód výrobku (SKU)";
// CPC se zapisuje do sloupce „Maximální cena za proklik - Heureka 2012". Ostatní
// sloupce zůstávají PRÁZDNÉ (CPC-only update) — hlavičky se zachovají dle vzoru
// `ebrana_import.xls`. Generuje se .xlsx (ebrana import přijímá xlsx; vzor byl
// legacy .xls). Pouze produkty S BIDEM (proposedCpc != null) — nedostupné/skip vynechány.
//
// Output je PLUGGABLE: další platforma (shoptet) = další adaptér + řádek v registru.
// ⚠️ Identifikátor SKU vs. ITEM_ID/shop_item.id ověř na reálném účtu (viz Dávka 5 §4).
// ─────────────────────────────────────────────────────────────

/** Hlavičky importu ebrana (pořadí dle vzoru `ebrana_import.xls`, 11 sloupců). */
export const EBRANA_HEADERS = [
  "Unikátní kód výrobku (SKU)",
  "Kód výrobku dodavatele",
  "Kód výrobce",
  "Cena nákupní",
  "Cena (Prodejní cena produktu)",
  "Zobrazit produkt (ano = 1, ne = 0)",
  "Váha (kg)",
  "Dostupnost (text)",
  "Cena za balení",
  "Maximální cena za proklik",
  "Maximální cena za proklik - Heureka 2012",
] as const;

export const EBRANA_SKU_HEADER = "Unikátní kód výrobku (SKU)";
export const EBRANA_HEUREKA_CPC_HEADER = "Maximální cena za proklik - Heureka 2012";

const SKU_IDX = EBRANA_HEADERS.indexOf(EBRANA_SKU_HEADER);
const CPC_IDX = EBRANA_HEADERS.indexOf(EBRANA_HEUREKA_CPC_HEADER);

/** Produkty, které se reálně dostanou do importu (mají navržený bid). */
export function biddableProposals(proposals: BiddingProposal[]): BiddingProposal[] {
  return proposals.filter((p) => p.proposedCpc != null);
}

/** Sestaví .xlsx buffer importu ebrana (jen produkty s bidem). */
export async function buildEbranaImport(
  proposals: BiddingProposal[],
): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Import");
  ws.addRow([...EBRANA_HEADERS]);
  ws.getRow(1).font = { bold: true };

  for (const p of biddableProposals(proposals)) {
    const cells: (string | number)[] = EBRANA_HEADERS.map(() => "");
    cells[SKU_IDX] = p.itemId;
    cells[CPC_IDX] = Math.round((p.proposedCpc ?? 0) * 100) / 100;
    ws.addRow(cells);
  }

  return wb.xlsx.writeBuffer();
}
