import type { BiddingProposal } from "../engine";
import { buildEbranaImport } from "./ebrana";

// ─────────────────────────────────────────────────────────────
// Registr OUTPUT adaptérů (importní formáty e-shopů). Nový e-shop = jeden záznam
// + builder. Vzorové soubory: ebrana (hotovo), shoptet (po dodání šablony zadavatelem).
// ─────────────────────────────────────────────────────────────

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export interface OutputFormat {
  key: string;
  label: string;
  contentType: string;
  ext: string;
  comingSoon?: boolean;
  build?: (proposals: BiddingProposal[]) => Promise<ArrayBuffer>;
}

export const OUTPUT_FORMATS: OutputFormat[] = [
  {
    key: "ebrana",
    label: "ebrana (Heureka CPC)",
    contentType: XLSX_MIME,
    ext: "xlsx",
    build: buildEbranaImport,
  },
  {
    key: "shoptet",
    label: "Shoptet (Heureka CPC)",
    contentType: XLSX_MIME,
    ext: "xlsx",
    comingSoon: true, // čeká na dodání importní šablony zadavatelem
  },
];

export function getOutputFormat(key: string): OutputFormat | undefined {
  return OUTPUT_FORMATS.find((f) => f.key === key);
}
