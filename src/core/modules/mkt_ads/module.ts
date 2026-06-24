import type { ModuleDefinition } from "../types";

// Modul „Reklamní výkon" (klíč `mkt_ads`, skupina `marketing`).
// Přehled výkonu napříč platformami per značka: tržby (Shoptet), náklady (ad
// platformy), PNO, ROAS, konverzní poměr. Čte VÝHRADNĚ přes `kpi.ts`/`MetricFact`
// (žádný přímý přístup k adaptérům); scope projektů přes `project-scope.ts`.
export const mktAdsModule: ModuleDefinition = {
  key: "mkt_ads",
  nazev: "Reklamní výkon",
  popis:
    "Tržby, náklady, ROAS a PNO napříč platformami — přehled výkonu per značka.",
  icon: "Megaphone",
  nav: { href: "/reklamni-vykon", label: "Reklamní výkon" },
  // view = vidět modul, viewall = vidět všechny projekty (značky), export = export.
  actions: ["view", "viewall", "export"],
  poradi: 30,
  group: "marketing",
};
