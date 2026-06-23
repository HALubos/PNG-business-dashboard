# Startovací prompt pro Claude Code

Otevři Claude Code v této složce a vlož níže uvedený prompt. V repu už jsou
`ZADANI-dashboard-v1.md`, `CLAUDE.md`, `docker-compose.yml` a `.env.example` —
Claude Code z nich má vyjít. Stavěj **po fázích**, po každé fázi se zastav a nech
mě to vyzkoušet.

---

## ① Úvodní prompt (zkopíruj celé)

```
Jsi senior full-stack vývojář. Stavíme modulární obchodní dashboard pro firmu
ACTIVENT365. Přečti si v repu `ZADANI-dashboard-v1.md` (plné zadání) a `CLAUDE.md`
(průvodce a pravidla) — řiď se jimi. Stack: Next.js (App Router, TypeScript),
PostgreSQL + Prisma, Auth.js, Tailwind + shadcn/ui, TanStack Table.

Postupuj po fázích. Po každé fázi se zastav, napiš mi jak to vyzkoušet, a počkej
na mé OK, než budeš pokračovat. Nedělej teď nic z fáze 2+ (Vario, Heureka,
automatizace importu, produkční hosting).

Začni FÁZÍ 0 (skelet). Cíl: spustitelná appka s přihlášením, rolemi/právy a
prázdným dashboardem, jejíž navigace se řídí moduly, na které má uživatel právo.

Konkrétně ve fázi 0:
1. Inicializuj Next.js projekt (TypeScript, App Router, Tailwind) zde v repu.
2. Nastav Prisma + připoj se na lokální PostgreSQL z docker-compose.yml
   (DATABASE_URL ber z .env.local podle .env.example).
3. Navrhni a vytvoř Prisma schéma jádra: User, Role, Permission, RolePermission,
   Module, UserModuleAccess, RepCustomer (přiřazení odběratele zástupci), AuditLog.
4. Auth.js přihlášení e-mailem a heslem (hesla hashovat). Bez registrace —
   uživatele zakládá seed/admin.
5. RBAC: helpery a guardy, které vynucují práva na backendu (per modul + per akce:
   view/export/edit/admin), ne jen v UI.
6. Registr modulů v `src/core/modules` — modul se zaregistruje (klíč, název,
   oprávnění, položka menu). Navigace v dashboardu se generuje z modulů, na které
   má přihlášený uživatel právo.
7. Seed: admin Lubos + 3 obchodní zástupci, role (Admin, Manažer, Zástupce) a jejich
   práva, registrace modulu „Kontrola skladovosti" (klíč `stock`).
8. Responzivní layout (desktop + mobil/tablet), UI česky.
9. README s kroky: docker compose up, migrace, seed, npm run dev.

Než začneš psát kód, navrhni mi krátce plán fáze 0 a schéma databáze ke schválení.
```

---

## ② Po schválení fáze 0 — prompt pro FÁZI 1 (modul skladovosti)

```
Pokračuj FÁZÍ 1 — modul „Kontrola skladovosti" (klíč `stock`). Drž se §5 zadání.

1. Datový model snapshotu importu: ImportSnapshot (datum, soubor, kdo nahrál),
   Product (EAN jako klíč, code, producer, název, size, kategorie, náš stock, cena),
   Reseller (doména, je_vlastni), ResellerProductAvailability (snapshot, product,
   reseller, stock, availability, cena). Vše vázané na snapshot (verzování).
2. Import Price Check XLSX přes UI (právo `stock.edit`/admin): parser pevných
   sloupců + opakujících se bloků odběratelů (1.–50., každý blok 6 sloupců — viz §10
   zadání). Ošetři prázdné buňky a `N/A`. Po importu krátký report (počet produktů,
   odběratelů, varování). Vzorový soubor je v data/sample/.
3. Označ naše vlastní e-shopy (pinguin.cz, activent.cz, acepac.bike, pinguin-shop.cz)
   jako vlastní — nepočítají se jako odběratelé.
4. Logika příležitostí pro zvoleného odběratele: náš stock > 0 A odběratel produkt
   listuje A jeho availability NENÍ v {skladem, do 3 dnů} (množina nastavitelná).
5. UI: výběr odběratele (hledání), filtry značka/kategorie, tabulka příležitostí
   (TanStack Table — produkt, EAN, značka, kategorie, naše cena, náš sklad, stav u
   odběratele), souhrn nahoře (počet příležitostí, datum snapshotu).
6. Export tabulky do XLSX/CSV (právo `stock.export`).
7. Respektuj RBAC a přiřazení odběratelů zástupci (RepCustomer).

Nejdřív mi ukaž návrh modelu a parseru, pak implementuj.
```

---

## ③ Tipy k průběhu

- **Vzorový soubor:** zkopíruj Price Check export do `data/sample/` (do gitu nepatří),
  ať na něm Claude Code může parser ladit.
- **Po fázi 0** ověř: přihlášení adminem, že se v menu zobrazí jen povolené moduly,
  že zástupce nevidí admin sekci.
- **Po fázi 1** ověř na reálném exportu: vyber odběratele a zkontroluj, že produkty
  „skladem" a „do 3 dnů" se v nabídce NEobjevují a že vlastní e-shopy nejsou mezi
  odběrateli.
- Drž jednu fázi = jeden ucelený krok; nenech appku rozjet všechno najednou.
