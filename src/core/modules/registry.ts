import type { ModuleDefinition } from "./types";
import { modulePermissionKeys } from "./types";
import { stockModule } from "./stock/module";

// ─────────────────────────────────────────────────────────────
// REGISTR MODULŮ
// Nový modul přidáš sem (jeden řádek) — žádný jiný zásah do jádra.
// ─────────────────────────────────────────────────────────────
const MODULES: ModuleDefinition[] = [stockModule];

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
