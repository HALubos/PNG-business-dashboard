import type { ModuleDefinition, ModuleGroup } from "./types";
import { modulePermissionKeys, GROUP_ORDER } from "./types";
import { stockModule } from "./stock/module";
import { analyticsModule } from "./analytics/module";
import { resellersModule } from "./resellers/module";

// ─────────────────────────────────────────────────────────────
// REGISTR MODULŮ
// Nový modul přidáš sem (jeden řádek) — žádný jiný zásah do jádra.
// ─────────────────────────────────────────────────────────────
const MODULES: ModuleDefinition[] = [
  stockModule,
  analyticsModule,
  resellersModule,
];

/** Všechny zaregistrované moduly, seřazené dle pořadí. */
export function allModules(): ModuleDefinition[] {
  return [...MODULES].sort((a, b) => a.poradi - b.poradi);
}

/** Modul podle klíče. */
export function getModule(key: string): ModuleDefinition | undefined {
  return MODULES.find((m) => m.key === key);
}

/**
 * Moduly, na které má uživatel právo (má alespoň `${key}.view`).
 * Tohle pohání navigaci v dashboardu.
 */
export function modulesForPermissions(
  permissions: ReadonlySet<string> | ReadonlyArray<string>,
): ModuleDefinition[] {
  const set = permissions instanceof Set ? permissions : new Set(permissions);
  return allModules().filter((m) => set.has(`${m.key}.view`));
}

/** Všechny klíče oprávnění deklarované všemi moduly (pro seed/administraci). */
export function allModulePermissionKeys(): string[] {
  return MODULES.flatMap(modulePermissionKeys);
}

/**
 * Moduly, na které má uživatel právo, rozdělené do skupin (Obchod / Marketing)
 * a seřazené dle pořadí. Modul bez `group` spadne pod „obchod". Pohání sekce
 * v navigaci. Skupiny zachovají pořadí z GROUP_ORDER; prázdné skupiny zůstanou.
 */
export function modulesByGroup(
  permissions: ReadonlySet<string> | ReadonlyArray<string>,
): Map<ModuleGroup, ModuleDefinition[]> {
  const result = new Map<ModuleGroup, ModuleDefinition[]>();
  for (const g of GROUP_ORDER) result.set(g, []);
  for (const m of modulesForPermissions(permissions)) {
    const group = m.group ?? "obchod";
    result.get(group)!.push(m);
  }
  return result;
}
