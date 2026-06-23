import type { ModuleDefinition } from "../types";

// Modul 1 — Kontrola skladovosti (klíč `stock`).
// Fáze 0: pouze registrace, oprávnění a položka menu. Vlastní logika
// (import Price Checku, tabulka příležitostí, export) přijde ve fázi 1.
export const stockModule: ModuleDefinition = {
  key: "stock",
  nazev: "Kontrola skladovosti",
  popis:
    "Produkty, které odběratel vyprodal, ale my je máme skladem — příležitosti k nabídce.",
  icon: "PackageSearch",
  nav: { href: "/skladovost", label: "Kontrola skladovosti" },
  // view = vidět modul (svoje odběratele), viewall = vidět všechny odběratele,
  // export = export tabulky, edit = import dat, admin = správa konfigurace.
  actions: ["view", "viewall", "export", "edit", "admin"],
  poradi: 10,
};
