import type { ModuleDefinition } from "../types";

// Modul „Obchodní analytika" (klíč `analytics`).
// Agregační vrstva nad logikou příležitostí z modulu `stock` — koho oslovit
// první a co tlačit do nabídek. Nezavádí nový datový zdroj ani import.
export const analyticsModule: ModuleDefinition = {
  key: "analytics",
  nazev: "Obchodní analytika",
  popis:
    "Koho oslovit první a co tlačit do nabídek — přehled příležitostí napříč odběrateli.",
  icon: "BarChart3",
  nav: { href: "/analytika", label: "Analytika" },
  // view = vidět modul (svoje odběratele), viewall = vidět všechny odběratele,
  // export = export žebříčků.
  actions: ["view", "viewall", "export"],
  poradi: 20,
};
