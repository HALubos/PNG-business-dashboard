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
    (vč. katalogových metadat) a registr adaptérů (`registry.ts`). Adaptéry
    **`shoptet_orders`** (Dávka 2), **`ga4`** (Dávka 3, OAuth) i reklamní
    **`google_ads`/`meta_ads`/`sklik`** (Dávka 4) jsou reálné. Placeholdery už
    nezbývají; další zdroje z katalogu (Heureka/Glami/RTB House/Ecomail…) jsou
    `comingSoon`.
  - **Kanonika metrik** `metrics.ts` (`CANONICAL_METRICS`: cost/revenue/impressions/
    clicks/conversions/sessions/users) + model `MetricFact`. **Odvozená KPI**
    (ROAS/PNO/konverzní poměr) v `kpi.ts` — JEDINÉ místo (anti-drift), vč.
    pravidla priority tržeb (e-shop `overridesRevenue` přebíjí GA4).
  - **Scheduler** `scheduler.ts` (in-process, interval `MARKETING_SYNC_INTERVAL_MIN`,
    start přes `src/instrumentation.ts`) + `runConnectorSync` (`sync.ts`) podle
    `runResellerFeedJob` (detached, `syncStatus`, `cursor`, upsert `MetricFact`,
    backfill `MARKETING_BACKFILL_FROM`). Reálně plní data všechny adaptéry
    (`shoptet_orders`, `ga4`, `google_ads`, `meta_ads`, `sklik`).
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
    case-insensitive, s fallbacky pro jiné šablony. **Tržba = cena BEZ DPH
    (`<WITHOUT_VAT>`) přepočtená na CZK kurzem `<CURRENCY><EXCHANGE_RATE>`; storno/
    zrušené objednávky (dle `<STATUS>`, `EXCLUDED_STATUS_PATTERNS`) se nepočítají.**
    Agreguje na **denní** `revenue` (suma) + `conversions` (počet objednávek) →
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
  - **Přepínač DPH:** kanonický `revenue` je BEZ DPH; e-shop zdroje emitují i
    `revenue_vat` (DPH část). Režim řeší **jen `kpi.ts`** (`VatMode` v `computeKpi`/
    `resolveRevenue`: „with" přičte `revenue_vat`). UI volí přes `?dph=s|bez` (default
    `bez`), promítne se do KPI, grafů i exportu. (Pravidlo priority tržeb beze změny.)
  - **Modul `mkt_ads` „Reklamní výkon"** (group `marketing`, klíč `mkt_ads`,
    `/reklamni-vykon`). KPI hlavička **z `kpi.ts`** (tržby, náklady, PNO, ROAS,
    konverzní poměr, konverze, počet platforem) + grafy (náklady vs. tržby denně,
    náklady dle platformy, týdenní srovnání — lehké CSS sloupce, bez knihovny). Filtr
    **projekt (značka) + období + přepínač DPH**, export XLSX/CSV (právo `mkt_ads.export`).
    Čte **výhradně** přes `MetricFact`/`kpi.ts` (datová vrstva `src/modules/mkt_ads/
    data.ts`, období `period.ts`), scope přes `project-scope.ts`. Náklady plní
    reklamní konektory z Dávky 4 (`google_ads`/`meta_ads`/`sklik`). Manažer má práva
    modulu, Admin vše.
- **Marketingová větev — Dávka 3 (GA4 OAuth konektor + modul Web analytika) HOTOVO.**
  - **Adaptér `ga4` (reálný `sync()`, `kind: oauth_api`)** — `src/core/connectors/
    adapters/ga4.ts`. PRVNÍ OAuth konektor. Volá GA4 **Analytics Data API**
    (`v1beta runReport`, dimenze `date`, metriky `sessions`/`totalUsers`/`conversions`/
    `purchaseRevenue`) → denní `MetricFact` (`source = ga4`): `sessions`, `users`,
    `conversions` a **`revenue` jen jako KONTROLNÍ** (pravidlo priority v `kpi.ts` ho
    přebíjí e-shopem; kde Shoptet není, GA4 je fallback tržeb — proto GA4 **nemá**
    `overridesRevenue`). GA4 vrací úplné denní agregáty (žádný částečný den), data ale
    dozrávají → re-fetch `TRAILING_REFETCH_DAYS` zpět. Tripwiry jako u shoptetu
    (první sync bez dat = chyba; inkrement bez dat = prázdno). Stránkování přes
    `offset/limit`. Refresh access tokenu při každém syncu (Google refresh token se
    nerotuje). `propertyId` + `refreshToken` jsou v **`credentialsEnc`** (šifrovaně,
    bez schema změny).
  - **OAuth flow (vzor pro budoucí OAuth konektory)** — `src/core/connectors/oauth/
    google.ts` (authUrl / exchange / refresh + `encodeState`/`decodeState` = state
    šifrovaný `CONNECTOR_ENC_KEY`, AES-GCM → integrita). Route handlery
    `src/app/api/connectors/ga4/{start,callback}/route.ts`: **start** (GET z formuláře
    karty, předá `projectId`+`propertyId`) přesměruje na Google consent
    (`access_type=offline` + `prompt=consent` → refresh token); **callback** vymění
    `code` za tokeny, upsertne `Connector` (cursor null = backfill) a spustí
    `startConnectorSync`. Secrety (`GOOGLE_OAUTH_CLIENT_ID/SECRET`) zadává člověk do
    `.env`; `redirect_uri` = `<NEXTAUTH_URL>/api/connectors/ga4/callback` (registruj
    v Google Cloud). Integrace karta GA4 je `comingSoon: false` s OAuth formulářem
    (Property ID + „Připojit přes Google"); výsledek roundtripu → banner (`?oauth=…`).
  - **Modul `mkt_analytics` „Web analytika"** (group `marketing`, klíč `mkt_analytics`,
    `/marketing/web-analytika`). KPI **z `kpi.ts`** (návštěvy, uživatelé, konverze,
    konverzní poměr) + grafy (denní návštěvnost, týdenní trend — lehké CSS sloupce).
    Filtr projekt + období, export XLSX/CSV (právo `mkt_analytics.export`). Čte
    **výhradně** přes `MetricFact`/`kpi.ts` (`src/modules/mkt_analytics/data.ts`),
    období + `getProjectDateBounds` + `isoWeekLabel` **sdílí s `mkt_ads`** (anti-drift).
    Manažer má práva modulu, Admin vše.
- **Marketingová větev — Dávka 4 (reklamní konektory: náklady → ROAS/PNO sedí) HOTOVO.**
  Tři reálné reklamní adaptéry emitují denní `cost`/`impressions`/`clicks`/`conversions`
  → `MetricFact`. Náklady se v `kpi.ts` jen SČÍTAJÍ napříč reklamními zdroji (`sumMetric
  "cost"`) — žádná nová KPI logika. Společné: trailing refetch (konverze dozrávají),
  cursor = nejnovější den, tripwiry (první sync bez dat = chyba; inkrement bez dat =
  prázdno). V repu nejsou reálné účty → názvy polí dle dokumentace API, ověř na účtu.
  - **`google_ads`** (`adapters/google-ads.ts`, OAuth) — GAQL `googleAds:searchStream`
    (FROM customer, `segments.date` + `metrics.cost_micros/impressions/clicks/conversions`;
    cost ÷ 1e6). Sdílí Google OAuth client s GA4 (`oauth/google.ts` zobecněn o
    `callbackPath` + `GOOGLE_ADS_SCOPE`/`GOOGLE_ADS_CALLBACK_PATH`); refresh tokenu uvnitř.
    Hlavička `developer-token` (`GOOGLE_ADS_DEVELOPER_TOKEN`) + volitelně
    `login-customer-id` (MCC). Flow `api/connectors/google-ads/{start,callback}`; karta:
    customer ID (+ volitelně MCC). `credentialsEnc` = {refreshToken, customerId, loginCustomerId?}.
  - **`meta_ads`** (`adapters/meta-ads.ts`, OAuth) — Graph API `/act_{id}/insights`
    (`time_increment=1`, `fields=spend,impressions,clicks,actions`). Meta NEMÁ refresh
    token: krátkodobý→dlouhodobý (~60 dní) token (`oauth/meta.ts`), při syncu BEST-EFFORT
    prodloužení (`fb_exchange_token`) + uložení nového tokenu (adaptér píše `credentialsEnc`
    sám). Backfill po 90denních oknech, stránkování `paging.next`. Konverze = nákupní
    `actions` dle priority (`omni_purchase`→`offsite_conversion.fb_pixel_purchase`→`purchase`).
    Flow `api/connectors/meta-ads/{start,callback}`; karta: ID reklamního účtu (`act_…`).
    `META_APP_ID/SECRET` v `.env`. `credentialsEnc` = {accessToken, adAccountId, expiresAt}.
  - **`sklik`** (`adapters/sklik.ts`, TOKEN-based — ne OAuth roundtrip) — `client.loginByToken`
    → session → `campaigns.createReport`/`readReport` (granularita „daily", offset/limit).
    Peníze v haléřích → ÷100 = CZK. Připojení server akcí `connectSklikAction` (token +
    volitelně `userId` účtu, šifrovaně do `credentialsEnc`); fallback `SKLIK_API_TOKEN`.
    Karta = token formulář (žádná start/callback route).
- **Marketingová větev — Dávka 5 (Heureka konektor + modul „Optimalizace srovnávačů") HOTOVO.**
  - **Adaptér `heureka`** (`adapters/heureka.ts`, TOKEN-based jako Sklik, `category:
    "srovnavace"`) — `GET /v1/reports/conversions?date=YYYY-MM-DD` (hlavička
    `x-heureka-api-key`) den po dni → denní `MetricFact` (`cost` bez DPH, `clicks`,
    `conversions`, `revenue` jako **KONTROLNÍ** — BEZ `overridesRevenue`, přebíjí ho
    e-shop, jako GA4). Trailing refetch 3 dny, tripwiry. Heureka je v Reklamním výkonu
    v ROAS/PNO vedle Google/Meta/Sklik (náklady se v `kpi.ts` jen sčítají). Připojení
    `connectHeurekaAction` (API klíč šifrovaně do `credentialsEnc`; volitelná URL
    katalogového feedu do `feedUrl`); fallback `HEUREKA_API_KEY`.
  - **Per-produktová vrstva `ProductMetricFact`** (per projekt+zdroj+den+`itemId`:
    clicks/cost/orders/revenue + `categoryId`/`name`) — detailní vrstva pod
    `MetricFact`, plněná **týmž** heureka syncem. KPI zůstávají nad `MetricFact`/
    `kpi.ts` (anti-drift). `itemId` = `shop_item.id` == feed `ITEM_ID` == SKU.
  - **Modul `mkt_bidding` „Optimalizace srovnávačů"** (group `marketing`, klíč
    `mkt_bidding`, `/marketing/optimalizace`). PRVNÍ „akční" (write-out) marketingový
    modul. **Engine** (`engine.ts`, čistá funkce, 14 testů `npm test`) počítá optimální
    CPC v **tvrdých mantinelech**: `floor ≤ CPC ≤ break-even (= marže×RPC)`, denní limit
    `±25 %`, round `0,01`, nedostupné/neziskové → bez bidu. **Fáze A** (bootstrap, málo
    dat) / **Fáze B** (PNO k cíli `1/target_roas`, default ROAS 3,0; přepínač 3,5/3,0/2,5).
    Pauza po ≥60 proklicích bez objednávky. Config v `config.ts` (defaulty + `.env`).
  - **Podklady enginu:** ceník floor CPC (`pricelist.ts`, `cenik-standard-cz.csv`,
    `sekceId`==`portal_category.id`), marže/maxCPA per interní kategorie (`margins.ts`,
    `PPC_nastavení.xlsx`, listy per značka, fallback celoznačková marže), mapování
    produkt→interní kategorie (`category-map.ts` z `CATEGORYTEXT` + override JSON),
    katalog (`catalog.ts` → `ProductCatalogItem`, PROUDOVĚ z Heureka XML feedu vzorem
    `feed-stream.ts`, dostupnost přes `OurStockItem` dle EANu). Cesty přes `.env`
    (`HEUREKA_PRICELIST_PATH`/`HEUREKA_MARGIN_PATH`/`HEUREKA_CATEGORY_MAP_PATH`), soubory
    v `data/sample/heureka/` (mimo git).
  - **Výstup = schválení.** Pluggable output adaptér (`output/registry.ts`): **ebrana**
    (reálný — zapíše CPC do importního `.xlsx`, klíč SKU + sloupec „Maximální cena za
    proklik - Heureka 2012"), shoptet `comingSoon`. Route `/api/mkt-bidding/export`:
    `?format=ebrana` (= schválení → uloží bidy do `BiddingBid` pro příští denní diff/
    limit) | `?format=review` (CSV s důvody). `mkt_bidding` práva: Manažer view/viewall/
    export/edit, Admin vše. Tlačítko „Obnovit katalog" (`mkt_bidding.edit`).
- **Marketing — další dávky (NEDĚLAT bez zadání):** srovnávače **Zboží.cz/Glami**
  (Heureka hotová — připrav jako další `source` + output adaptér), affiliate (RTB
  House/CJ), e-mail, sociální organic, AI analýza webu.
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
│                             #   CONNECTOR_ENC_KEY, MARKETING_SYNC_INTERVAL_MIN, MARKETING_BACKFILL_FROM,
│                             #   GOOGLE_OAUTH_CLIENT_ID/SECRET, GOOGLE_ADS_DEVELOPER_TOKEN,
│                             #   META_APP_ID/SECRET, SKLIK_API_TOKEN, HEUREKA_API_KEY,
│                             #   HEUREKA_PRICELIST_PATH/MARGIN_PATH/CATEGORY_MAP_PATH, BIDDING_*)
├─ prisma.config.ts           # Prisma 7 config (URL pro migrace + seed)
├─ ZADANI-dashboard-v1.md     # plné zadání · CLAUDE.md · README.md
├─ prisma/
│  ├─ schema.prisma           # User, Role, Permission, Module, Reseller(+feed), RepCustomer, AuditLog,
│  │                          #   ImportSnapshot, Product, ResellerProductAvailability, StockConfig, OurStockItem, ResellerFeedItem,
│  │                          #   Project, Connector, MetricFact, ProductMetricFact, ProductCatalogItem, BiddingBid
│  │                          #   (+ enumy ConnectorKind/ConnectorType{…,heureka}/SyncStatus)
│  ├─ migrations/             # SQL migrace
│  └─ seed.ts                 # admin Lubos + 3 zástupci + role/práva + modul + StockConfig
├─ src/
│  ├─ proxy.ts                # middleware (Next 16) — gate na přihlášení
│  ├─ app/
│  │  ├─ (auth)/login/        # přihlášení + server action
│  │  ├─ (dashboard)/         # layout s navigací dle práv
│  │  │  ├─ page.tsx          # rozcestník · admin/ · skladovost/ · analytika/ · odberatele/ · integrace/ · reklamni-vykon/
│  │  └─ api/{auth,stock/export,analytics/export,mkt-ads/export,mkt-analytics/export,mkt-bidding/export,
│  │     │      connectors/{ga4,google-ads,meta-ads}/{start,callback}}/  # OAuth flow
│  │     └─ (dashboard)/marketing/{web-analytika,optimalizace}/    # moduly mkt_analytics, mkt_bidding
│  ├─ instrumentation.ts      # start in-process scheduleru konektorů (Node runtime)
│  ├─ core/
│  │  ├─ auth/                # auth.config.ts, auth.ts, session.ts, password.ts
│  │  ├─ modules/             # registry.ts (REGISTR + modulesByGroup), types.ts (+ group/GROUP_LABELS)
│  │  ├─ projects/            # project-scope.ts (scope značek)
│  │  ├─ connectors/          # types (adaptér+katalog), registry, adapters/ (shoptet/ga4/google-ads/meta-ads/sklik/heureka), oauth/ (google+meta), metrics, kpi, sync, scheduler, crypto
│  │  └─ rbac/                # access.ts (can/assert), permissions.ts (+ admin.connectors/projects)
│  ├─ modules/stock/          # constants, opportunities, rules, reseller-scope, import/, feed/, components/
│  ├─ modules/analytics/      # aggregate (žebříčky + trend), components/
│  ├─ modules/resellers/      # feed/ (formats registr + feed-stream + service, proudově), components/
│  ├─ modules/mkt_ads/        # data (MetricFact→KPI), period, components/ (toolbar + grafy)
│  ├─ modules/mkt_analytics/  # Web analytika: data (MetricFact→KPI), components/ (toolbar + grafy)
│  ├─ modules/mkt_bidding/    # engine(+test), config, pricelist, margins, category-map, catalog, data, output/ (ebrana), components/
│  ├─ components/{ui,dashboard,integrace}/
│  ├─ lib/{prisma,utils}.ts
│  └─ generated/prisma/       # generovaný Prisma klient (mimo git)
└─ data/sample/               # Price Check XLSX + heureka/ (cenik, PPC_nastavení, ebrana_import) — mimo git
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
npm test                      # node:test (engine bidding) — src/**/*.test.ts
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
