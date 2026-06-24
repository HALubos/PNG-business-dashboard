import { config as loadEnv } from "dotenv";
// Seed běží mimo Next.js → načteme .env.local ručně.
loadEnv({ path: ".env.local" });
loadEnv();

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { allModules } from "../src/core/modules/registry";
import { allPermissionDescriptors } from "../src/core/rbac/permissions";
import { hashPassword } from "../src/core/auth/password";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// Práva přiřazená rolím (klíče oprávnění).
const ROLE_PERMISSIONS: Record<string, string[]> = {
  // Admin dostane všechna práva (doplní se dynamicky níže).
  Admin: [],
  // Manažer: vidí data VŠECH odběratelů a může exportovat, bez správy uživatelů.
  Manažer: [
    "stock.view",
    "stock.viewall",
    "stock.export",
    "analytics.view",
    "analytics.viewall",
    "analytics.export",
    "resellers.view",
    "resellers.viewall",
    "resellers.edit",
    "resellers.admin",
    "mkt_ads.view",
    "mkt_ads.viewall",
    "mkt_ads.export",
  ],
  // Zástupce: vidí svůj modul a své odběratele, může exportovat.
  Zástupce: [
    "stock.view",
    "stock.export",
    "analytics.view",
    "analytics.export",
    "resellers.view",
  ],
};

// Marketingové projekty = naše značky.
const PROJECTS = [
  { klic: "pinguin", nazev: "Pinguin", web: "pinguin.cz" },
  { klic: "acepac", nazev: "Acepac", web: "acepac.bike" },
  { klic: "activent", nazev: "Activent", web: "activent.cz" },
];

// Naše vlastní e-shopy — nepočítají se jako odběratelé (§5.2 zadání).
const OWN_SHOPS = ["pinguin.cz", "activent.cz", "acepac.bike", "pinguin-shop.cz"];
// Pár demo odběratelů (skutečné domény z exportu) pro fázi 0.
const DEMO_RESELLERS = ["affekt.cz", "batac.cz", "vertikal.cz", "hudy.cz", "rockpoint.cz"];

async function main() {
  console.log("🌱 Seed: start");

  // ── Role ───────────────────────────────────────────────
  const roleDefs = [
    { nazev: "Admin", popis: "Plná správa systému, vidí vše." },
    { nazev: "Manažer", popis: "Vidí data všech zástupců, exporty, bez správy uživatelů." },
    { nazev: "Zástupce", popis: "Vidí své moduly a jen své přiřazené odběratele." },
  ];
  const roles: Record<string, string> = {};
  for (const r of roleDefs) {
    const role = await prisma.role.upsert({
      where: { nazev: r.nazev },
      update: { popis: r.popis },
      create: r,
    });
    roles[r.nazev] = role.id;
  }
  console.log(`  ✓ role: ${Object.keys(roles).join(", ")}`);

  // ── Oprávnění (jádro + z modulů) ───────────────────────
  const permDescriptors = allPermissionDescriptors();
  const permIdByKey: Record<string, string> = {};
  for (const p of permDescriptors) {
    const perm = await prisma.permission.upsert({
      where: { klic: p.klic },
      update: { moduleKey: p.moduleKey, akce: p.akce, popis: p.popis },
      create: p,
    });
    permIdByKey[p.klic] = perm.id;
  }
  console.log(`  ✓ oprávnění: ${permDescriptors.length}`);

  // Admin = všechna oprávnění.
  ROLE_PERMISSIONS.Admin = permDescriptors.map((p) => p.klic);

  // ── Přiřazení práv rolím (idempotentně) ────────────────
  for (const [roleName, klice] of Object.entries(ROLE_PERMISSIONS)) {
    const roleId = roles[roleName];
    await prisma.rolePermission.deleteMany({ where: { roleId } });
    await prisma.rolePermission.createMany({
      data: klice.map((klic) => ({ roleId, permissionId: permIdByKey[klic] })),
      skipDuplicates: true,
    });
    console.log(`  ✓ ${roleName}: ${klice.length} práv`);
  }

  // ── Registrace modulů ──────────────────────────────────
  for (const m of allModules()) {
    await prisma.module.upsert({
      where: { klic: m.key },
      update: { nazev: m.nazev, poradi: m.poradi, aktivni: true },
      create: { klic: m.key, nazev: m.nazev, poradi: m.poradi, aktivni: true },
    });
  }
  const moduleRows = await prisma.module.findMany();
  console.log(`  ✓ moduly: ${allModules().map((m) => m.key).join(", ")}`);

  // ── Marketingové projekty (značky) ─────────────────────
  for (const p of PROJECTS) {
    await prisma.project.upsert({
      where: { klic: p.klic },
      update: { nazev: p.nazev, web: p.web },
      create: p,
    });
  }
  console.log(`  ✓ projekty: ${PROJECTS.map((p) => p.klic).join(", ")}`);

  // ── Odběratelé (vlastní e-shopy + demo) ────────────────
  for (const d of OWN_SHOPS) {
    await prisma.reseller.upsert({
      where: { domena: d },
      update: { jeVlastni: true },
      create: { domena: d, jeVlastni: true, nazev: d },
    });
  }
  const resellerIds: string[] = [];
  for (const d of DEMO_RESELLERS) {
    const r = await prisma.reseller.upsert({
      where: { domena: d },
      update: { jeVlastni: false },
      create: { domena: d, jeVlastni: false, nazev: d },
    });
    resellerIds.push(r.id);
  }
  console.log(`  ✓ odběratelé: ${DEMO_RESELLERS.length} demo + ${OWN_SHOPS.length} vlastní`);

  // ── Uživatelé ──────────────────────────────────────────
  const adminPwd = process.env.SEED_ADMIN_PASSWORD || "heslo123";
  const repPwd = process.env.SEED_REP_PASSWORD || "heslo123";

  const userDefs = [
    { jmeno: "Lubos", email: "lubos@activent365.cz", role: "Admin", heslo: adminPwd },
    { jmeno: "Jan Novák", email: "jan.novak@activent365.cz", role: "Zástupce", heslo: repPwd },
    { jmeno: "Petr Svoboda", email: "petr.svoboda@activent365.cz", role: "Zástupce", heslo: repPwd },
    { jmeno: "Eva Dvořáková", email: "eva.dvorakova@activent365.cz", role: "Zástupce", heslo: repPwd },
  ];

  const userIds: Record<string, string> = {};
  for (const u of userDefs) {
    const hesloHash = await hashPassword(u.heslo);
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { jmeno: u.jmeno, roleId: roles[u.role], hesloHash, aktivni: true },
      create: {
        jmeno: u.jmeno,
        email: u.email,
        hesloHash,
        aktivni: true,
        roleId: roles[u.role],
      },
    });
    userIds[u.email] = user.id;

    // Přístup ke všem modulům (zrcadlí oprávnění; připraveno na jemnější správu).
    for (const m of moduleRows) {
      await prisma.userModuleAccess.upsert({
        where: { userId_moduleId: { userId: user.id, moduleId: m.id } },
        update: {},
        create: { userId: user.id, moduleId: m.id },
      });
    }
  }
  console.log(`  ✓ uživatelé: ${userDefs.length}`);

  // ── Přiřazení odběratelů zástupcům (RepCustomer) ───────
  const reps = [
    "jan.novak@activent365.cz",
    "petr.svoboda@activent365.cz",
    "eva.dvorakova@activent365.cz",
  ];
  // Rozdělíme demo odběratele mezi zástupce round-robin.
  await prisma.repCustomer.deleteMany({
    where: { userId: { in: reps.map((e) => userIds[e]) } },
  });
  for (let i = 0; i < resellerIds.length; i++) {
    const repEmail = reps[i % reps.length];
    await prisma.repCustomer.create({
      data: { userId: userIds[repEmail], resellerId: resellerIds[i] },
    });
  }
  console.log("  ✓ přiřazení odběratelů zástupcům");

  // ── Konfigurace modulu skladovosti (singleton) ─────────
  await prisma.stockConfig.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, availableStates: ["skladem", "do 3 dnů"], stockThreshold: 0 },
  });
  console.log("  ✓ konfigurace modulu stock (dostupné stavy: skladem, do 3 dnů)");

  console.log(
    "\n✅ Seed hotov. Přihlašovací údaje (heslo z .env.local, default heslo123):",
  );
  for (const u of userDefs) {
    console.log(`   • ${u.role.padEnd(9)} ${u.email}`);
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("❌ Seed selhal:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
