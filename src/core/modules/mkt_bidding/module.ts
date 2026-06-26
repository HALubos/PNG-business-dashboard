import type { ModuleDefinition } from "../types";

// Modul „Optimalizace srovnávačů" (klíč `mkt_bidding`, skupina `marketing`).
// Z per-produktových dat srovnávače (Heureka) počítá optimální CPC v mantinelech
// (floor ≤ CPC ≤ break-even, denní limit) a generuje IMPORTNÍ soubor pro e-shop.
// První „akční" (write-out) marketingový modul. Per-produkt detail nad MetricFactem;
// KPI/agregace zůstávají v `kpi.ts`. Scope projektů přes `project-scope.ts`.
export const mktBiddingModule: ModuleDefinition = {
  key: "mkt_bidding",
  nazev: "Optimalizace srovnávačů",
  popis:
    "Návrhy optimálního CPC pro srovnávače (Heureka) a generování importu pro e-shop.",
  icon: "Gauge",
  nav: { href: "/marketing/optimalizace", label: "Optimalizace srovnávačů" },
  // view = vidět modul, viewall = vidět všechny projekty, export = generovat import, edit = obnovit katalog.
  actions: ["view", "viewall", "export", "edit"],
  poradi: 35,
  group: "marketing",
};
