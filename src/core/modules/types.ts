// Typy registru modulů. Modul je samostatná funkční jednotka dashboardu,
// která se zaregistruje do jádra (klíč, název, oprávnění, položka menu).
// Přidání modulu NESMÍ vyžadovat zásah do jádra — jen registraci v registry.ts.

export type ModuleAction = "view" | "viewall" | "export" | "edit" | "admin";

/** Skupina v navigaci („nadmenu"). Default je „obchod". */
export type ModuleGroup = "obchod" | "marketing";

/** Lidské popisky skupin (jediné místo). */
export const GROUP_LABELS: Record<ModuleGroup, string> = {
  obchod: "Obchod",
  marketing: "Marketing",
};

/** Pořadí, v jakém se skupiny vykreslují v navigaci. */
export const GROUP_ORDER: ModuleGroup[] = ["obchod", "marketing"];

/** Lidsky čitelné popisy akcí (pro administraci práv). */
export const ACTION_LABELS: Record<ModuleAction, string> = {
  view: "Zobrazení",
  viewall: "Vidět všechny odběratele",
  export: "Export",
  edit: "Úpravy / import",
  admin: "Správa modulu",
};

export interface ModuleDefinition {
  /** Unikátní klíč modulu, např. "stock". */
  key: string;
  /** Název do menu a nadpisů, např. "Kontrola skladovosti". */
  nazev: string;
  /** Krátký popis pro rozcestník. */
  popis?: string;
  /** Název ikony z lucide-react (mapováno v UI). */
  icon: string;
  /** Cesta a popisek položky v navigaci. */
  nav: { href: string; label: string };
  /** Akce, které modul definuje jako oprávnění (klíč = `${key}.${action}`). */
  actions: ModuleAction[];
  /** Pořadí v menu. */
  poradi: number;
  /** Skupina v navigaci. Když chybí, modul spadne pod „obchod". */
  group?: ModuleGroup;
}

/** Sestaví klíč oprávnění modulu, např. ("stock","view") → "stock.view". */
export function permKey(moduleKey: string, action: ModuleAction): string {
  return `${moduleKey}.${action}`;
}

/** Všechny klíče oprávnění, které modul deklaruje. */
export function modulePermissionKeys(mod: ModuleDefinition): string[] {
  return mod.actions.map((a) => permKey(mod.key, a));
}
