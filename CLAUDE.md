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
- **Modul „Obchodní analytika" (klíč `analytics`) — HOTOVO.** Agregační vrstva nad
  logikou `stock` (žádný nový zdroj/import). Žebříček odběratelů („koho oslovit") +
  top produkty napříč trhem („co tlačit") + KPI souhrn + trend (porovnání 2 snapshotů).
  Sdílené pravidlo z `src/modules/stock/rules.ts` (anti-drift) a scope z
  `src/modules/stock/reseller-scope.ts`. Služba: `src/modules/analytics/aggregate.ts`,
  stránka `/analytika`, export `/api/analytics/export`. Headline = živý sklad,
  trend = verzovaný `Product.ourStock` obou snapshotů.
- **Modul „Odběratelé" (klíč `resellers`) — HOTOVO.** Správa karet odběratelů +
  **per-odběratel feed dostupnosti**. Feed ZPŘESŇUJE Price Check: má-li odběratel
  `feedUrl` a proběhl refresh (`feedRefreshedAt`) a EAN je ve feedu → dostupnost
  (a ks) z feedu, jinak fallback Price Check. Formát se vybírá z registru
  (`src/modules/resellers/feed/formats.ts`: heureka / google / interni / ostatni →
  `feedConfig`). Pravidlo sdílené v `rules.ts` (`effectiveAvailabilityFor` +
  `createResellerAvailabilityResolver`); zapojené do `stock` i `analytics` headline
  (trend zůstává na verzovaném Price Checku). Stránky `/odberatele` (+ detail/edit).
  **Feed se zpracovává PROUDOVĚ** (`feed-stream.ts` — bez DOM, ~300 MB i na 144 MB
  feedu) a ukládá **jen EANy z našeho sortimentu** (makalu: 536 z 32 705). Běží
  **na pozadí** (`runResellerFeedJob`, detached z akce) se stavem `feedStatus`
  (`processing`/`ok`/`error`); UI pollu­je. Náš skladový feed (`OurStockItem`) je oddělený.
- **Marketingová větev — Fáze A (jádro) HOTOVO.** Aditivní rozšíření jádra na
  interní přehledový systém (po vzoru primio.one), bez zásahu do obchodních modulů.
  - **Skupiny menu:** `ModuleDefinition.group` (`obchod` | `marketing`, default
    `obchod`), `modulesByGroup()` v registru, navigace vykresluje sekce
    (`GROUP_LABELS`/`GROUP_ORDER` v `src/core/modules/types.ts`).
  - **Projekt = značka** (`Project`, klíče `pinguin`/`acepac`/`activent`, seedováno).
    Scope `src/core/projects/project-scope.ts` (vzor `reseller-scope.ts`).
  - **Konektor vrstva** `src/core/connectors/`: modely `Connector` + enumy
    `ConnectorKind`/`ConnectorType`/`SyncStatus`, abstrakce `ConnectorAdapter`
    (vč. katalogových metadat) a registr adaptérů (`registry.ts`). Adaptér
    **`shoptet_orders` je reálný** (viz „Dávka 2" níže); `ga4`, `google_ads`,
    `meta_ads`, `sklik` jsou zatím **placeholdery** (`sync()` vrací prázdno;
    OAuth = „brzy", disabled).
  - **Kanonika metrik** `metrics.ts` (`CANONICAL_METRICS`: cost/revenue/impressions/
    clicks/conversions/sessions/users) + model `MetricFact`. **Odvozená KPI**
    (ROAS/PNO/konverzní poměr) v `kpi.ts` — JEDINÉ místo (anti-drift), vč.
    pravidla priority tržeb (e-shop `overridesRevenue` přebíjí GA4).
  - **Scheduler** `scheduler.ts` (in-process, interval `MARKETING_SYNC_INTERVAL_MIN`,
    start přes `src/instrumentation.ts`) + `runConnectorSync` (`sync.ts`) podle
    `runResellerFeedJob` (detached, `syncStatus`, `cursor`, upsert `MetricFact`,
    backfill `MARKETING_BACKFILL_FROM`). Reálně plní data `shoptet_orders`;
    OAuth adaptéry zatím dry-run.
  - **RBAC + secrets:** práva `admin.connectors` / `admin.projects` v
    `CORE_PERMISSIONS`; tokeny šifrované at-rest (`crypto.ts`, `CONNECTOR_ENC_KEY`).
  - **Stránka Integrace** (`/integrace`, právo `admin.connectors`): katalog karet
    z registru adaptérů, přepínač projektu, stav připojení (polling),
    připojit/odpojit/aktualizovat, hláška o backfillu, štítek „přebíjí GA4".
- **Marketingová větev — Dávka 2 (Shoptet tržby + modul Reklamní výkon) HOTOVO.**
  - **Adaptér `shoptet_orders` (reálný `sync()`)** — `src/core/connectors/adapters/
    shoptet-orders.ts`. Proudově stáhne export objednávek z `connector.feedUrl` (vzor
    `feed-stream.ts`). **Formát Shoptetu** (ověřeno proti reálnému exportu, pattern
    objednávek): kořen `<ORDERS>`, položka `<ORDER>` (VELKÝMI — `streamFeedBlocks` to
    odliší od `<ORDER_ID>`/`<ORDER_ITEMS>` lookaheadem `[\s/>]`), datum `<DATE>`,
    order-level celek `<TOTAL_PRICE><WITH_VAT>`. Položky `<ORDER_ITEMS>`/`<ITEM>` mají
    VLASTNÍ `<TOTAL_PRICE>`/`<UNIT_PRICE>` → před čtením celku se odříznou. Pole se čtou
    case-insensitive, s fallbacky pro jiné šablony. Agreguje na **denní** `revenue`
    (suma cen vč. DPH) + `conversions` (počet objednávek) →
    `MetricFact` (`source = shoptet_orders`, `overridesRevenue = true`). **Tripwiry**
    (po vzoru `processResellerFeed`): první sync bez `<order>` → chyba; bloky jsou, ale
    0 načteno → chyba „zkontrolujte mapování polí"; inkrement bez novinek → prázdno.
    Inkrement i 15min limit
    Shoptetu řeší **vždy** přes `&updateTimeFrom=YYYY-MM-DD` (z `connector.cursor`,
    první běh = backfill `MARKETING_BACKFILL_FROM`). **Korektnost přepisu:** emituje
    metriky jen pro dny `>= since` (objednávka dne D má `updateTime >= D`, takže okno
    `updateTimeFrom=D` pokrývá tyto dny úplně → přepis `MetricFact` je správný; starší
    dny jsou v inkrementu jen částečné a zahazují se). Pozn.: pozdější změna **ceny**
    objednávky starší než cursor se nepromítne (potřebovala by per-objednávkovou
    tabulku — mimo MVP). Polní názvy Shoptetu jsou tolerantní (v repu není vzorek).
  - **Modul `mkt_ads` „Reklamní výkon"** (group `marketing`, klíč `mkt_ads`,
    `/reklamni-vykon`). KPI hlavička **z `kpi.ts`** (tržby, náklady, PNO, ROAS,
    konverzní poměr, konverze, počet platforem, návštěvy) + grafy (náklady vs. tržby
    denně, náklady dle platformy, týdenní srovnání — lehké CSS sloupce, bez knihovny).
    Filtr **projekt (značka) + období**, export XLSX/CSV (právo `mkt_ads.export`).
    Čte **výhradně** přes `MetricFact`/`kpi.ts` (datová vrstva `src/modules/mkt_ads/
    data.ts`, období `period.ts`), scope přes `project-scope.ts`. Náklady jsou zatím
    0 (reklamní konektory = dávka 3+). Manažer má práva modulu, Admin vše.
- **Marketing — další dávky (NEDĚLAT bez zadání):** reálné `sync()` OAuth adaptérů
  (GA4, Google/Meta Ads, Sklik), OAuth flow, modul `mkt_analytics` (Web analytika).
- **Fáze 2+ — NEDĚLAT teď:** Vario, Heureka jako úplně nové listingy, automatické
  (cron) stahování feedů **v obchodní větvi**, produkční hosting. Nové moduly se
  přidávají na zadání.

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

## Datový tok & sdílené vzory (ČTI před úpravou logiky)

**Tři zdroje dat o skladu/dostupnosti** (kombinují se, nepřepisují celé):
1. **Price Check XLSX** → `ImportSnapshot` / `Product` / `ResellerProductAvailability`
   (verzované snapshoty). Dává: sortiment odběratele, výchozí dostupnost, XLSX sklad.
2. **Náš skladový feed** (`STOCK_FEED_URL`) → `OurStockItem` (živý NÁŠ sklad dle EANu).
3. **Feed odběratele** (`Reseller.feedUrl`) → `ResellerFeedItem` (živá dostupnost
   odběratele dle EANu, per odběratel).

**Sloučení = JEDINÉ sdílené pravidlo `src/modules/stock/rules.ts`** (zdroj pravdy,
NIKDY neduplikuj — to je anti-drift):
- `createStockResolver` + `effectiveStockFor` → efektivní NÁŠ sklad (feed → fallback `Product.ourStock`).
- `createResellerAvailabilityResolver` + `effectiveAvailabilityFor` → efektivní DOSTUPNOST
  odběratele (jeho feed → fallback Price Check); `stockSource` / `availabilitySource` říká odkud.
- `classifyProduct` → `opportunity` / `reseller_has` / `we_out` (porovnání s `StockConfig.availableStates`).

**Kdo pravidlo volá:** `stock` (`categorizeResellerProducts` v `opportunities.ts`) i
`analytics` (`aggregate.ts`). Když měníš logiku příležitostí, uprav **jen `rules.ts`** — promítne se do obou.

**RBAC scope odběratelů** = `src/modules/stock/reseller-scope.ts`
(`getVisibleResellers` / `canViewReseller` s klíčem práva `<modul>.viewall`). Sdílí
ho stock i analytics i resellers — opět neduplikovat.

**Trend v analytice** = verzovaný Price Check (`Product.ourStock` + surová `availability`
obou snapshotů) — živé feedy se NEverzují, do trendu nevstupují.

**Marketing — sdílené vzory (anti-drift, NEduplikovat):**
- **Kanonika metrik** `src/core/connectors/metrics.ts` = slovník atomických metrik
  (zdroj pravdy). Adaptér mapuje syrová data na ně → `MetricFact` (per projekt+zdroj+den).
- **Odvozená KPI** `src/core/connectors/kpi.ts` = JEDINÉ místo výpočtu ROAS/PNO/
  konverzního poměru a **pravidla priority tržeb** (e-shop s `overridesRevenue`
  přebíjí GA4). Moduly marketingu volají odsud, nikdy nepočítají KPI per-konektor.
- **Registr adaptérů** `src/core/connectors/registry.ts` — nový konektor = jeden
  adaptér v `adapters/` + řádek v registru. Katalog (Integrace) i běhová smyčka
  (`sync.ts`) čtou ze stejného registru. Adaptér nese i katalogová metadata.
- **Sync na pozadí** `src/core/connectors/sync.ts` (`runConnectorSync`/`startConnectorSync`)
  = přesná obdoba `runResellerFeedJob` (detached, `syncStatus`, `cursor`, upsert).
- **Scope projektů** `src/core/projects/project-scope.ts` = obdoba `reseller-scope.ts`
  (`getVisibleProjects`/`canViewProject`, klíč práva `<modul>.viewall`).

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

Pro zvoleného odběratele zobraz produkty, kde současně platí (vyhodnocuje `rules.ts`):

1. **My skladem:** efektivní náš sklad > práh (`StockConfig.stockThreshold`). Efektivní
   sklad = `OurStockItem` (živý feed) → fallback `Product.ourStock` (XLSX).
2. **Odběratel produkt prodává:** v Price Checku se u produktu objevuje jeho doména
   (sortiment je z Price Checku — i ve v1 s feedy).
3. **Odběratel nemá dostupné:** jeho **efektivní** `Availability` **NENÍ** v `availableStates`
   (default `{skladem, do 3 dnů}`). Efektivní dostupnost = feed odběratele → fallback Price
   Check. Nedostupné = `do týdne`, `two_weeks`, `do měsíce`, `info v obchodu`, `vyprodáno`, nebo chybí.

**Vokabulář stavů** (`KNOWN_AVAILABILITY_STATES` v `src/modules/stock/constants.ts`):
`skladem`, `do 3 dnů`, `do týdne`, `two_weeks`, `do měsíce`, `info v obchodu`, **`vyprodáno`**.
Feedy normalizují své hodnoty na tento vokabulář (Google `out of stock`→`vyprodáno`,
`in stock`→`skladem`; interní `0 ks`→`vyprodáno`). **`vyprodáno` = explicitní „není skladem"
z feedu**, ≠ `null`/„neuvedeno" (= stav neznámý). Oba jsou „nedostupné" (kandidát na nabídku).

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
├─ .env.example / .env.local  # env (DATABASE_URL, AUTH_SECRET, SEED_*, STOCK_FEED_URL,
│                             #   CONNECTOR_ENC_KEY, MARKETING_SYNC_INTERVAL_MIN, MARKETING_BACKFILL_FROM)
├─ prisma.config.ts           # Prisma 7 config (URL pro migrace + seed)
├─ ZADANI-dashboard-v1.md     # plné zadání · CLAUDE.md · README.md
├─ prisma/
│  ├─ schema.prisma           # User, Role, Permission, Module, Reseller(+feed), RepCustomer, AuditLog,
│  │                          #   ImportSnapshot, Product, ResellerProductAvailability, StockConfig, OurStockItem, ResellerFeedItem,
│  │                          #   Project, Connector, MetricFact (+ enumy ConnectorKind/ConnectorType/SyncStatus)
│  ├─ migrations/             # SQL migrace
│  └─ seed.ts                 # admin Lubos + 3 zástupci + role/práva + modul + StockConfig
├─ src/
│  ├─ proxy.ts                # middleware (Next 16) — gate na přihlášení
│  ├─ app/
│  │  ├─ (auth)/login/        # přihlášení + server action
│  │  ├─ (dashboard)/         # layout s navigací dle práv
│  │  │  ├─ page.tsx          # rozcestník · admin/ · skladovost/ · analytika/ · odberatele/ · integrace/ · reklamni-vykon/
│  │  └─ api/{auth,stock/export,analytics/export,mkt-ads/export}/
│  ├─ instrumentation.ts      # start in-process scheduleru konektorů (Node runtime)
│  ├─ core/
│  │  ├─ auth/                # auth.config.ts, auth.ts, session.ts, password.ts
│  │  ├─ modules/             # registry.ts (REGISTR + modulesByGroup), types.ts (+ group/GROUP_LABELS)
│  │  ├─ projects/            # project-scope.ts (scope značek)
│  │  ├─ connectors/          # types (adaptér+katalog), registry, adapters/, metrics, kpi, sync, scheduler, crypto
│  │  └─ rbac/                # access.ts (can/assert), permissions.ts (+ admin.connectors/projects)
│  ├─ modules/stock/          # constants, opportunities, rules, reseller-scope, import/, feed/, components/
│  ├─ modules/analytics/      # aggregate (žebříčky + trend), components/
│  ├─ modules/resellers/      # feed/ (formats registr + feed-stream + service, proudově), components/
│  ├─ modules/mkt_ads/        # data (MetricFact→KPI), period, components/ (toolbar + grafy)
│  ├─ components/{ui,dashboard,integrace}/
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

## Co teď NEdělat (fáze 2+)

Vario integrace, Heureka, **automatické stahování** Price Checku / feedu **v
obchodní větvi** (cron), produkční hosting a citlivost dat. To je fáze 2+ — bez
výslovného zadání neřešit.

> **Revize rozhodnutí o automatizaci:** pro **marketingovou větev** je
> automatizace (in-process scheduler, pull feedy, OAuth API) **povolena** —
> mění to dosavadní „zákaz cronu ve fázi 2", ale jen pro marketing. Plné zadání
> a fáze marketingu viz `docs/marketing/navrh-architektury-marketing.md`.

Nové **moduly** se naopak přidávají na zadání (tak vznikl `analytics`) — vždy přes
registraci (viz „Přidání nového modulu"), nikdy zásahem do jádra. Nové **konektory**
se přidávají přes registr adaptérů (`src/core/connectors/registry.ts`).
