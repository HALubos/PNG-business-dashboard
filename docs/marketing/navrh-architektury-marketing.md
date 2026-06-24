# Návrh úpravy architektury — rozšíření na interní přehledový systém (marketing)

> **Toto je prompt pro Claude Code.** Vlož celý tento soubor jako zadání. Úkolem
> je **rozšířit jádro** dashboardu ACTIVENT365 tak, aby uneslo marketingové moduly
> (po vzoru aplikace primio.one), a **založit první dva marketingové moduly**.
> Postupuj po fázích, každou fázi nech ověřit (typecheck + build + migrace) než
> pokračíš. Drž se stávajících konvencí a vzorů v repu — neduplikuj logiku.

---

## 0. Kontext a cíl

Dnes je projekt **obchodní dashboard** (moduly `stock`, `analytics`, `resellers`)
nad jedním zdrojem dat (Price Check XLSX + XML feedy, párování dle EANu). Chceme
z něj udělat **modulární interní přehledový systém** a přidat **marketingovou
sekci** — agregaci reklamního výkonu a web analytiky napříč platformami do
přehledu per značka. Inspirace: **primio.one** (KPI hlavička: tržby, náklady,
PNO, ROAS, konverzní poměr, návštěvnost; grafy náklady vs. tržby, náklady dle
platformy, týdenní srovnání).

**Potvrzená rozhodnutí zadavatele:**

- **Zdroj dat = API konektory + URL feedy** (ne ruční import). Automatizace
  (scheduler) je tímto pro marketing **povolena** — mění to dosavadní „zákaz cronu
  ve fázi 2", ale jen pro marketingovou větev.
- **Interní použití**, struktura projektů = **naše značky**: Pinguin, Acepac,
  Activent (multi-klient/agenturní model NEřešíme).
- **MVP rozsah:** (1) **reklamní výkon** (náklady, ROAS, PNO, tržby) a (2) **web
  analytika** (návštěvnost, konverze). Sociální sítě (organic) a „AI analýza webu →
  auto-profil" jsou **nice-to-have na později**, ne teď.
- **Zdroj tržeb (autoritativní) = Shoptet**, export objednávek přes **permanentní
  URL** s autorizačním hashem (volitelně omezenou na IP), inkrementálně přes
  `&updateTimeFrom=YYYY-MM-DD`. Tedy **pull-feed, žádné OAuth, žádný MCP.**
- **Náklady + návštěvnost = reklamní/analytická API** (Meta Ads, Google Ads,
  Sklik, GA4) přes **OAuth**.
- **KPI logika:** `ROAS = tržby(Shoptet) / náklady(ad platformy)`,
  `PNO = náklady / tržby`, vše **per projekt (značka) per den**.

**Klíčový princip:** nové věci přidávej **bez breaking změn jádra**. Marketing je
nová větev, obchodní moduly musí fungovat beze změny.

---

## 1. Vzory, které MUSÍŠ znovupoužít (anti-drift, nezdvojovat)

Repo už má vyřešené přesně ty mechanismy, které marketing potřebuje. Použij je,
nevymýšlej nové:

| Potřeba marketingu | Existující vzor v repu | Soubor |
|---|---|---|
| Stahování dat na pozadí + stav + UI polling | `runResellerFeedJob` (detached job, `feedStatus` = processing/ok/error) | `src/modules/resellers/feed/` |
| Streamované parsování velkého feedu (bez DOM) | `feed-stream.ts` | `src/modules/resellers/feed/feed-stream.ts` |
| Jedno sdílené pravidlo = zdroj pravdy (anti-drift) | `rules.ts` (`classifyProduct`, resolvery) | `src/modules/stock/rules.ts` |
| Scope dat dle práv | `reseller-scope.ts` (`getVisibleResellers`/`canViewReseller`) | `src/modules/stock/reseller-scope.ts` |
| Registrace modulu bez zásahu do jádra | `ModuleDefinition` + `registry.ts` | `src/core/modules/` |
| RBAC per modul/akce, vynuceno na backendu | `can`/`assertPermission`, `permKey` | `src/core/rbac/`, `src/core/modules/types.ts` |

Technické konvence repa (dodržet): **Prisma 7** (klient v `src/generated/prisma`,
import `@/generated/prisma/client`, URL v `prisma.config.ts` + `@prisma/adapter-pg`),
**Auth.js v5** (split config), **Next.js 16** (middleware = `src/proxy.ts`),
**exceljs**, **TanStack Table**, **shadcn/ui**, UI **česky**, systémové fonty.

---

## 2. FÁZE A — Jádro: skupiny menu + projekty + konektor vrstva

### A1. Skupiny v navigaci („nadmenu")

Aditivní, zpětně kompatibilní rozšíření registru modulů:

- Do `ModuleDefinition` (`src/core/modules/types.ts`) přidej volitelné pole
  `group?: "obchod" | "marketing"` (default `"obchod"`).
- `registry.ts` rozšiř o helper `modulesByGroup(permissions)` → mapa skupina →
  moduly (seřazené dle `poradi`).
- Navigace (`src/components/dashboard/...`) vykreslí sekce s nadpisem skupiny
  (Obchod / Marketing). Stávající moduly nech bez `group` → spadnou pod „Obchod".
- Lidské popisky skupin drž v jednom místě (např. `GROUP_LABELS` v `types.ts`).

### A2. Projekt (značka) jako entita

Nový Prisma model `Project` — kontejner, ke kterému se vážou konektory a metriky:

```
model Project {
  id          String   @id @default(cuid())
  klic        String   @unique   // "pinguin" | "acepac" | "activent"
  nazev       String
  web         String?            // doména webu (pro pozdější AI profil)
  createdAt   DateTime @default(now())
  connectors  Connector[]
  metrics     MetricFact[]
}
```

Naseeduj 3 projekty (Pinguin, Acepac, Activent). Scope projektů řeš **analogicky
`reseller-scope.ts`** → nový `src/core/projects/project-scope.ts`
(`getVisibleProjects`/`canViewProject`, klíč práva `<modul>.viewall`). Interně
budou nejspíš všichni vidět vše, ale vzor zachovej kvůli budoucnu.

### A3. Generická konektor vrstva (jádro celé změny)

Subsystém v jádře (`src/core/connectors/`), který umí **dvě rodiny zdrojů**:

1. **URL feed (pull)** — Shoptet objednávky, případně další feedy. Bez OAuth.
2. **OAuth API** — Meta Ads, Google Ads, Sklik, GA4. Token + refresh.

Datové modely:

```
enum ConnectorKind { url_feed  oauth_api }

enum ConnectorType { shoptet_orders  meta_ads  google_ads  sklik  ga4 }

enum SyncStatus { idle  processing  ok  error }

model Connector {
  id            String        @id @default(cuid())
  projectId     String
  project       Project       @relation(fields: [projectId], references: [id])
  kind          ConnectorKind
  type          ConnectorType
  nazev         String
  // url_feed:
  feedUrl       String?
  // oauth_api (ŠIFROVANĚ at-rest — nikdy plaintext do DB):
  credentialsEnc String?      // šifrovaný JSON s tokeny/refresh
  // stav syncu (vzor jako Reseller.feedStatus):
  syncStatus    SyncStatus    @default(idle)
  lastSyncAt    DateTime?
  lastError     String?
  cursor        String?       // inkrement (Shoptet updateTimeFrom; API since)
  active        Boolean       @default(true)
  createdAt     DateTime      @default(now())
  @@unique([projectId, type])
}
```

**Abstrakce v kódu** (`src/core/connectors/types.ts`). Adaptér nese i **katalogová
metadata** — z nich se vykreslí stránka Integrace (viz A7), takže nový konektor
přidá kartu sám:

```ts
export type ConnectorCategory =
  | "reklama"        // Google/Meta Ads, Sklik, RTB House, CJ Affiliate
  | "analytika"      // GA4, Search Console, Microsoft Clarity
  | "eshop_trzby"    // Shoptet, Shopify, WooCommerce, Upgates… (přebíjí GA4 tržby)
  | "srovnavace"     // Heureka, Zboží.cz, Glami, Srovnáme
  | "email"          // Ecomail, SmartEmailing
  | "social"         // YouTube, Google Business Profile
  | "ostatni";       // Počasí apod.

export interface ConnectorAdapter {
  type: ConnectorType;
  kind: ConnectorKind;
  // katalog (stránka Integrace):
  nazev: string;            // "Google", "Shoptet"
  popis: string;            // "Google Ads, GA4 a Shopping."
  icon: string;             // klíč ikony/loga
  category: ConnectorCategory;
  /** Přebíjí tržby z GA4? (true pro eshop_trzby zdroje.) */
  overridesRevenue?: boolean;
  /** Stáhne a znormalizuje data od `since` do kanonických metrik. */
  sync(ctx: { connector: Connector; since: Date | null }): Promise<CanonicalMetric[]>;
}
```

Registr adaptérů (`src/core/connectors/registry.ts`) — nový konektor = jeden
záznam, žádný zásah do běhové smyčky (stejná filozofie jako modul registr).
Katalog na stránce Integrace i běhová smyčka čtou ze stejného registru.

### A4. Kanonický model metrik (anti-drift, obdoba `rules.ts`)

Jeden slovník metrik = zdroj pravdy. Každý adaptér mapuje svoje syrová data na něj;
odvozená KPI se počítají **až nad kanonikou, na jednom místě** (nikdy per-konektor).

```
// Kanonické metriky (atomické, NE odvozené):
//   cost, revenue, impressions, clicks, conversions, sessions, users
model MetricFact {
  id         String   @id @default(cuid())
  projectId  String
  project    Project  @relation(fields: [projectId], references: [id])
  source     ConnectorType   // odkud metrika je
  date       DateTime @db.Date // denní granularita
  metric     String          // jeden z kanonických klíčů
  value      Float
  @@unique([projectId, source, date, metric])
}
```

- Slovník drž v `src/core/connectors/metrics.ts`
  (`CANONICAL_METRICS`, normalizační helpery).
- **Odvozená KPI** (`ROAS`, `PNO`, `konverzní poměr`) počítej v jedné sdílené
  službě `src/core/connectors/kpi.ts` z `MetricFact`. Náklady = součet ad platforem.
  **Tržby = priorita zdroje:** je-li připojený e-shop konektor s
  `overridesRevenue` (Shoptet apod.), bere se jeho `revenue` a **přebíjí GA4**;
  jinak fallback na GA4 revenue. Toto pravidlo priority drž **jen tady** (obdoba
  `rules.ts`). Moduly `mkt_ads` i `mkt_analytics` volají `kpi.ts`, neduplikují.

### A5. Scheduler + sync job

- Lehký in-process scheduler (`src/core/connectors/scheduler.ts`) — periodicky
  spustí `runConnectorSync(connectorId)` pro aktivní konektory.
- `runConnectorSync` napiš **přesně podle `runResellerFeedJob`** (detached job,
  `syncStatus` processing→ok/error, zapiš `lastSyncAt`/`lastError`/`cursor`,
  upsert `MetricFact`). UI pollu­je stav.
- **Backfill při připojení:** po prvním připojení konektoru stáhni historii od
  konfigurovatelného data (default jako Primio = **1. 1. 2025**, `.env`
  `MARKETING_BACKFILL_FROM`). První import může být dlouhý → běží na pozadí se
  stavem `processing` (uživatele na to v UI upozorni, viz A7).
- Manuální „Aktualizovat teď" tlačítko (právo `admin`).
- Interval konfigurovatelný přes `.env` (např. `MARKETING_SYNC_INTERVAL_MIN`).

### A6. RBAC a administrace

- Konektory a projekty = **sdílená infrastruktura** → správa v administraci jádra
  (ne uvnitř jednoho modulu). Přidej do `CORE_PERMISSIONS` práva
  `admin.connectors` (správa konektorů) a `admin.projects`.
- Tokeny šifruj at-rest (klíč v `.env`, např. `CONNECTOR_ENC_KEY`).
  **Zadávání samotných credentials/secretů dělá člověk v UI/`.env`, ne automat.**

### A7. Stránka „Integrace" (katalog konektorů, vzor primio.one)

Centrální stránka pro připojování zdrojů — řízená **registrem adaptérů** (A3),
takže každý nový adaptér se objeví automaticky.

- **Přepínač projektu** nahoře („Nastavení pro projekt → Pinguin/Acepac/Activent").
  Integrace se připojují **per projekt**.
- **Mřížka karet**: ikona/logo, název, krátký popis, **stav** (Nepřipojeno /
  Připojeno / Stahuji… / Chyba) + akce Připojit / Odpojit / Aktualizovat. Stav
  čte ze `syncStatus` konektoru (polling).
- Karty volitelně **seskupené dle `category`** (Reklama, Analytika, E-shop tržby,
  Srovnávače, E-mail, Sociální, Ostatní).
- **Připojení:**
  - `url_feed` (Shoptet): formulář na vložení permanentní URL (+ pozn. o hashi/IP).
  - `oauth_api`: tlačítko „Připojit" spustí OAuth flow dané platformy.
- **Hláška o backfillu** (jako Primio): „Po připojení se stáhnou data od
  {MARKETING_BACKFILL_FROM}. U větších účtů může první import trvat desítky minut."
- U `eshop_trzby` karet popisek **„Přesné tržby — přebíjí GA4 data"** (= pravidlo
  priority z `kpi.ts`).
- Volitelně (polish): „Navrhnout integraci" + kontakt na pomoc.

Přístup hlídá `admin.connectors`. Pro MVP stačí implementovat karty pro reálné
adaptéry z Fáze B; ostatní (Heureka, Glami, RTB House, Ecomail, YouTube, Clarity,
Počasí…) můžou být v registru jako „brzy" / disabled, aby byl katalog kompletní
a rozšiřitelný.

---

## 3. FÁZE B — Konektory (adaptéry)

Pořadí podle hodnoty a složitosti:

1. **`shoptet_orders` (url_feed) — PRVNÍ, je nejjednodušší a dává tržby.**
   - Adaptér stáhne Shoptet export objednávek z `feedUrl`, inkrementálně přes
     `&updateTimeFrom=`. Parsuj **streamovaně** (vzor `feed-stream.ts`).
   - Z objednávek agreguj denní `revenue` (a `conversions` = počet objednávek)
     → `MetricFact` (`source = shoptet_orders`).
   - `cursor` = poslední `updateTime`; respektuj limit „více než 1× za 15 min jen
     přes updateTimeFrom" z dokumentace Shoptetu.
2. **`ga4` (oauth_api)** — `sessions`, `users`, `conversions`, případně revenue
   (ale autoritativní revenue zůstává Shoptet — GA4 revenue neukládej jako
   `revenue`, max jako kontrolní metriku).
3. **`google_ads` (oauth_api)** — `cost`, `impressions`, `clicks`, `conversions`.
4. **`meta_ads` (oauth_api)** — totéž z Meta Graph API.
5. **`sklik` (oauth_api / API token)** — `cost`, `impressions`, `clicks`.

Pro každý OAuth adaptér: řeš refresh tokenů, rate-limity a stránkování uvnitř
adaptéru; ven dávej jen kanonické metriky. OAuth flow per platforma je jiný —
implementuj postupně, každý za samostatný ověřitelný krok.

---

## 4. FÁZE C — Marketingové moduly (UI)

Dva moduly ve skupině `marketing`, oba přes běžnou registraci (`module.ts` +
řádek v `registry.ts` + seed):

### C1. `mkt_ads` — Reklamní výkon
- KPI hlavička: **tržby, náklady, PNO, ROAS, konverzní poměr, konverze, počet
  platforem** (z `kpi.ts`).
- Grafy: denní **náklady vs. tržby**, **náklady dle platformy**, týdenní srovnání.
- Filtr: projekt (značka) + období. Export XLSX/CSV (právo `export`).

### C2. `mkt_analytics` — Web analytika
- Návštěvnost (sessions/users), konverze, konverzní poměr, trend.
- Filtr projekt + období; export.

Obě stránky čtou výhradně přes `kpi.ts`/`MetricFact` — žádný přímý přístup k
adaptérům. Scope přes `project-scope.ts`.

---

## 5. Pořadí práce (každý bod = ověřit `npm run typecheck && npm run build`)

1. **A1** skupiny menu (aditivní). Ověřit, že obchodní moduly fungují beze změny.
2. **A2** model `Project` + migrace + seed 3 značek + `project-scope.ts`.
3. **A3+A4** konektor modely + abstrakce + kanonické metriky + migrace.
4. **A5** scheduler + `runConnectorSync` (zatím bez reálného adaptéru, dry-run).
5. **A6 + A7** RBAC práva, šifrování tokenů a **stránka Integrace** (katalog z
   registru, zatím s adaptéry „brzy").
6. **B1** Shoptet adaptér (tržby) — end-to-end první reálná data (připojí se z A7).
7. **C1** modul `mkt_ads` nad reálnými tržbami + (zatím nulové) náklady.
8. **B2–B5** OAuth adaptéry postupně; po GA4 zapojit **C2** `mkt_analytics`.
9. Na závěr **aktualizovat `CLAUDE.md` a `ZADANI-dashboard-v1.md`** (nová větev
   marketing, revize rozhodnutí o automatizaci, nové modely a vzory).

---

## 6. Co teď NEdělat (mimo rozsah)

- Sociální sítě (organic dosah/engagement) a **AI analýza webu → auto-profil**
  (Primio funkce) — až po MVP.
- Multi-klient / agenturní model (libovolný počet externích klientů).
- Produkční hosting, citlivost dat nad rámec šifrování tokenů.
- Zásahy do logiky obchodních modulů (`stock`/`analytics`/`resellers`).

---

## 7. Definition of Done (MVP marketingu)

- V menu je sekce **Marketing** s moduly **Reklamní výkon** a **Web analytika**,
  viditelná dle práv.
- Existuje **stránka Integrace** (katalog karet z registru, per projekt, se stavem
  připojení); přes ni lze připojit Shoptet konektor, který reálně stahuje
  objednávky a plní denní **tržby** (s backfillem od `MARKETING_BACKFILL_FROM`).
- KPI (ROAS/PNO/konverzní poměr) se počítají v `kpi.ts` z kanonických metrik;
  po zapojení reklamních konektorů sedí náklady i ROAS.
- Sync běží na pozadí se stavem (processing/ok/error) + manuální tlačítko.
- `typecheck`, `lint`, `build` procházejí; obchodní moduly beze změny.
- `CLAUDE.md` a zadání aktualizované.
```