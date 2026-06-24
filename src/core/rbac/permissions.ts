import { allModules } from "../modules/registry";
import { ACTION_LABELS, permKey } from "../modules/types";

// Popis jednoho oprávnění (zrcadlí model Permission v DB).
export interface PermissionDescriptor {
  klic: string;
  moduleKey: string;
  akce: string;
  popis: string;
}

// Oprávnění jádra (administrace). Moduly si svá oprávnění deklarují samy.
export const CORE_PERMISSIONS: PermissionDescriptor[] = [
  {
    klic: "admin.view",
    moduleKey: "admin",
    akce: "view",
    popis: "Přístup do administrace",
  },
  {
    klic: "admin.users",
    moduleKey: "admin",
    akce: "admin",
    popis: "Správa uživatelů, rolí a práv",
  },
  {
    klic: "admin.modules",
    moduleKey: "admin",
    akce: "admin",
    popis: "Správa modulů a přístupů uživatelů",
  },
  {
    klic: "admin.audit",
    moduleKey: "admin",
    akce: "view",
    popis: "Zobrazení auditního logu",
  },
  // Marketingová větev: konektory a projekty jsou sdílená infrastruktura →
  // jejich správa patří do administrace jádra (ne dovnitř jednoho modulu).
  {
    klic: "admin.connectors",
    moduleKey: "admin",
    akce: "admin",
    popis: "Správa konektorů (integrace)",
  },
  {
    klic: "admin.projects",
    moduleKey: "admin",
    akce: "admin",
    popis: "Správa projektů (značek)",
  },
];

/** Klíč modulu „admin" pro navigaci administrace. */
export const ADMIN_MODULE_KEY = "admin";

/**
 * Kompletní seznam oprávnění v systému = jádro + oprávnění deklarovaná moduly.
 * Používá seed a (později) administrace práv.
 */
export function allPermissionDescriptors(): PermissionDescriptor[] {
  const fromModules: PermissionDescriptor[] = allModules().flatMap((mod) =>
    mod.actions.map((akce) => ({
      klic: permKey(mod.key, akce),
      moduleKey: mod.key,
      akce,
      popis: `${mod.nazev} — ${ACTION_LABELS[akce]}`,
    })),
  );
  return [...CORE_PERMISSIONS, ...fromModules];
}
