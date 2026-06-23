# CLAUDE.md — Obchodní dashboard ACTIVENT365

Tento soubor čte Claude Code při práci na projektu. Plné zadání je v
**`ZADANI-dashboard-v1.md`** — vždy vycházej z něj, tohle je rychlý průvodce.

## O co jde

Modulární obchodní dashboard pro firmu ACTIVENT365 (značky Pinguin, Acepac,
Activent). Nahrazuje řízení přes e-maily a tabulky. **Jádro + zásuvné moduly**,
přihlášení, role a práva. **První modul = Kontrola skladovosti**: zástupci ukázat
produkty, které jeho odběratel vyprodal, ale my je máme skladem.

## Aktuální stav (co je hotové)

> Slouží k plynulému navázání (AI i člověk). Detailní postup spuštění je v `README.md`.

- **Fáze 0 (skelet) — HOTOVO a ověřeno.** Přihlášení e-mail/heslo (Auth.js v5),
  RBAC (role + práva per modul/akce, vynuceno na backendu), registr modulů,
  navigace dle práv, responzivní layout (sidebar + mobilní sheet), administrace
  (read-only přehled uživatelů/rolí/modulů/auditu).
- **Fáze 1 (modul „Kontrola skladovosti", klíč `stock`) — HOTOVO a ověřeno** proti
  reálnému Price Check exportu. Import XLSX přes UI (verzované snapshoty), parser,
  logika příležitostí (§5.4), výběr odběratele, tabulka (TanStack), export XLSX/CSV,
  konfigurace dostupných stavů + prahu, RBAC scope dat (Admin/Manažer vidí vše,
  Zástupce jen své přes `RepCustomer`). Produkty u odběratele se dělí do **3 bloků**:
  🟢 příležitosti (akční seznam + export) · ⚪ „už má od nás skladem" (sbalený, šedý) ·
  ⚪ „vyprodáno u nás" (sbalený, vč. 🔴 restock kandidátů). Logika v
  `categorizeResellerProducts` (`src/modules/stock/opportunities.ts`).
  **Náš sklad** se bere z **živého XML feedu** (`STOCK_FEED_URL`, párování dle EANu,
  `src/modules/stock/feed/`) — aktualizace tlačítkem i automaticky při importu;
  produkt mimo feed = 0 ks. XLSX `Stock` je jen fallback, dokud feed neproběhl.
- **Fáze 2+ — NEDĚLAT teď:** Vario, Heureka, automatický import, produkční hosting,
  další moduly.

### Klíčová technická rozhodnutí (odchylky od původní specifikace)

- **Prisma 7:** generátor `prisma-client` → klient se generuje do `src/generated/prisma`
  (NE do `node_modules`); import `@/generated/prisma/client`. Connection URL je v
  `prisma.config.ts` (migrace) a přes `@prisma/adapter-pg` v `src/lib/prisma.ts` (runtime).
  `.env.local` načítá Prisma ručně přes `dotenv`.
- **Auth.js v5:** split konfigurace — `src/core/auth/auth.config.ts` (edge-safe, pro proxy)
  + `src/core/auth/auth.ts` (Node, Credentials provider, bcrypt). JWT session, práva v tokenu.
- **Next.js 16:** middleware je v `src/proxy.ts` (nová konvence „proxy"). Fonty systémové
  (kvůli offline + české diakritice).
- **RBAC akce:** `view / viewall / export / edit / admin`. Guardy: `requirePermission()`
  (stránky), `assertPermission()`/`can()` (akce/handlery), `canViewReseller()` (scope dat).
- **Lokální DB:** Docker přes **Colima** (na stroji není Docker Desktop). Viz Příkazy.

## Terminologie (důležité)

- **Obchodní zástupce** = uživatel dashboardu (náš člověk).
- **Odběratel / obchodník** = B2B zákazník (e-shop / prodejna), který od nás bere zboží.
- **My / výrobce** = ACTIVENT365.

## Stack a konvence

- **Next.js (App Router, TypeScript)** — frontend i API v jednom repu.
- **PostgreSQL + Prisma** — DB běží **lokálně** přes `docker compose`.
- **Auth.js (NextAuth)** — e-mail/heslo.
- **Tailwind CSS + shadcn/ui** — responzivní UI (desktop + mobil/tablet). UI **česky**.
- **TanStack Table** — tabulky s řazením/filtrováním.
- Parsování XLSX na serveru přes **`exceljs`**.

## Klíčová pravidla (potvrzeno se zadavatelem)

- Nasazení v1 **lokálně** (prototyp k předvádění). Konfigurace přes `.env`, hosting-agnostické.
- Zdroj dat v1 = **Price Check XLSX, ruční nahrání**. Vario a automatizace = fáze 2+, **teď neřešit**.
- **Modularita povinná:** přidání modulu nesmí vyžadovat zásah do jádra, jen registraci.
- **Práva per modul + per akce** (view/export/edit/admin; navíc `viewall` pro rozsah dat)
  vynucená **na backendu**, ne jen v UI.
- Každý import = **verzovaný snapshot** (nic se nepřepisuje naslepo).

## Logika modulu skladovosti (přesně)

Pro zvoleného odběratele zobraz produkty, kde současně platí:

1. **My skladem:** náš `Stock` > 0.
2. **Odběratel produkt prodává:** v Price Checku se u produktu objevuje jeho doména.
3. **Odběratel nemá dostupné:** jeho `Availability` **NENÍ** v `{skladem, do 3 dnů}`
   (tj. `do týdne`, `two_weeks`, `do měsíce`, `info v obchodu`, nebo nelistuje).
   Množina dostupných stavů je konfigurovatelná (default `skladem`, `do 3 dnů`).

Spojovací klíč produktů = **EAN**. **Naše vlastní e-shopy** (pinguin.cz, activent.cz,
acepac.bike, pinguin-shop.cz) označ jako vlastní a **nepočítej je jako odběratele**.

UI navíc dělí produkty odběratele do 3 bloků (příležitosti = výše uvedená logika;
„už má od nás skladem" a „vyprodáno u nás / restock" jako sbalený kontext). Počet
a export jsou jen o příležitostech. Implementace: `categorizeResellerProducts`.

Mapování sloupců Price Check viz §5.2 a §10 v `ZADANI-dashboard-v1.md`. Vzorový
soubor: `data/sample/` (ručně tam zkopíruj export, do gitu se necommituje).

## Struktura repa (skutečná)

```
/
├─ docker-compose.yml         # lokální PostgreSQL
├─ .env.example / .env.local  # env (DATABASE_URL, AUTH_SECRET, SEED_*, STOCK_FEED_URL)
├─ prisma.config.ts           # Prisma 7 config (URL pro migrace + seed)
├─ ZADANI-dashboard-v1.md     # plné zadání · CLAUDE.md · README.md
├─ prisma/
│  ├─ schema.prisma           # User, Role, Permission, Module, Reseller, RepCustomer, AuditLog,
│  │                          #   ImportSnapshot, Product, ResellerProductAvailability, StockConfig, OurStockItem
│  ├─ migrations/             # SQL migrace
│  └─ seed.ts                 # admin Lubos + 3 zástupci + role/práva + modul + StockConfig
├─ src/
│  ├─ proxy.ts                # middleware (Next 16) — gate na přihlášení
│  ├─ app/
│  │  ├─ (auth)/login/        # přihlášení + server action
│  │  ├─ (dashboard)/         # layout s navigací dle práv
│  │  │  ├─ page.tsx          # rozcestník · admin/ · skladovost/ (page + actions)
│  │  └─ api/{auth,stock/export}/
│  ├─ core/
│  │  ├─ auth/                # auth.config.ts, auth.ts, session.ts, password.ts
│  │  ├─ modules/             # registry.ts (REGISTR), types.ts, stock/module.ts
│  │  └─ rbac/                # access.ts (can/assert), permissions.ts
│  ├─ modules/stock/          # constants, opportunities, import/{parser,import-service}, feed/{feed-parser,feed-service}, components/
│  ├─ components/{ui,dashboard}/
│  ├─ lib/{prisma,utils}.ts
│  └─ generated/prisma/       # generovaný Prisma klient (mimo git)
└─ data/sample/               # vzorový Price Check XLSX (mimo git)
```

### Přidání nového modulu (bez zásahu do jádra)
1. `src/core/modules/<klic>/module.ts` (definice `ModuleDefinition`).
2. Přidat do pole v `src/core/modules/registry.ts` (1 řádek).
3. `npm run db:seed` — zaregistruje modul a jeho oprávnění.

## Příkazy

```bash
colima start                  # spustí Docker démona (Colima; po restartu PC znovu)
docker compose up -d          # lokální PostgreSQL (localhost:5432)
npm run db:deploy             # aplikuje migrace  (dev: npm run db:migrate)
npm run db:seed               # admin + zástupci + role/práva + modul + config
npm run dev                   # Next.js dev server (http://localhost:3000)
npm run db:studio             # Prisma Studio
npm run typecheck             # tsc --noEmit  ·  npm run lint  ·  npm run build
```

Seed účty (heslo `heslo123`): `lubos@activent365.cz` (Admin),
`jan.novak@`, `petr.svoboda@`, `eva.dvorakova@activent365.cz` (Zástupce).

## Živá skladovost (XML feed)

Náš aktuální sklad pochází z XML feedu (`STOCK_FEED_URL` v `.env.local`; kořen
`<feed>`, položky `<entry>`, pole `extra_EAN_EAN`=EAN, `availability`=ks,
`availability7d`=příjem do 7 dnů). Tabulka `OurStockItem` (globální dle EANu) se
přepíše při aktualizaci. Aktualizace: tlačítko v `/skladovost` (`stock.edit`) nebo
automaticky při importu XLSX. Cron automatizace = fáze 2.

## Co teď NEdělat

Vario integrace, Heureka, automatické stahování Price Checku, produkční hosting,
další moduly. Drž se fáze 0 a 1 (viz §8 zadání).
