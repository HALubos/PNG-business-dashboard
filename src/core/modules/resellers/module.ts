import type { ModuleDefinition } from "../types";

// Modul „Odběratelé" (klíč `resellers`). Správa karet odběratelů — teď hlavně
// feed dostupnosti a jeho napojení do logiky. Karta se rozšiřuje přidáním sloupce.
export const resellersModule: ModuleDefinition = {
  key: "resellers",
  nazev: "Odběratelé",
  popis:
    "Správa odběratelů a jejich feedů dostupnosti (Heureka / Google / Interní / Ostatní).",
  icon: "Store",
  nav: { href: "/odberatele", label: "Odběratelé" },
  // view = seznam (dle scope), viewall = všichni odběratelé, edit = úprava karty/feedu,
  // admin = správa modulu.
  actions: ["view", "viewall", "edit", "admin"],
  poradi: 30,
};
