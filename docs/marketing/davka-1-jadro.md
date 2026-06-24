# Dávka 1 — Fáze A: jádro + stránka Integrace

> **Prompt pro Claude Code.** Pracuješ v repu *Obchodní dashboard ACTIVENT365*
> (Next.js 16 / TypeScript / Prisma 7 / Auth.js v5 / Tailwind + shadcn/ui).
> **NEŽ začneš:** přečti `CLAUDE.md` a `docs/marketing/navrh-architektury-marketing.md`
> (master spec). Drž jeho konvence a vzory. Řeš **jen** rozsah této dávky.

## Větev
`feat/marketing-core` (z `main`).

## Cíl dávky
Postavit nosnou infrastrukturu pro marketingovou větev — **bez jakéhokoli reálného
externího API**. Po dávce existuje kostra, na kterou se v dalších dávkách jen
připojují adaptéry a moduly.

## Rozsah (sekce A1–A7 master specu)
1. **A1 — Skupiny menu.** `group?: "obchod" | "marketing"` v `ModuleDefinition`
   (default `"obchod"`), `modulesByGroup()` v registru, navigace vykreslí sekce.
   Obchodní moduly se NESMÍ změnit chováním.
2. **A2 — Model `Project`** + migrace + seed 3 značek (Pinguin, Acepac, Activent)
   + `src/core/projects/project-scope.ts` (vzor `reseller-scope.ts`).
3. **A3 — Konektor vrstva** (`src/core/connectors/`): modely `Connector`,
   enumy `ConnectorKind/ConnectorType/SyncStatus`, `ConnectorAdapter` (vč.
   katalogových metadat), registr adaptérů. Adaptéry zaregistruj jako **placeholdery
   „brzy" (disabled)** — žádná reálná implementace `sync()` v této dávce.
4. **A4 — Kanonika** (`src/core/connectors/metrics.ts`) + `MetricFact` model +
   `src/core/connectors/kpi.ts` (ROAS/PNO/konverzní poměr; pravidlo priority tržeb
   eshop→GA4 připrav, i když zatím bez dat).
5. **A5 — Scheduler** (`scheduler.ts`) + `runConnectorSync` podle `runResellerFeedJob`
   (detached job, `syncStatus`, `cursor`, upsert `MetricFact`). Zatím **dry-run**
   (volá adaptér placeholder, který vrací prázdno) — ověř, že smyčka, stav a polling
   fungují. Backfill logika připravená (`MARKETING_BACKFILL_FROM`).
6. **A6 — RBAC + secrets.** Práva `admin.connectors`, `admin.projects` do
   `CORE_PERMISSIONS`. Šifrování tokenů at-rest (`CONNECTOR_ENC_KEY`). Seed práv.
7. **A7 — Stránka Integrace** (`/integrace` nebo `/marketing/integrace`): katalog
   karet z registru adaptérů, přepínač projektu, stav připojení (polling), akce
   připojit/odpojit/aktualizovat, hláška o backfillu, štítek „přebíjí GA4" u eshop
   karet. Adaptéry „brzy" zobraz jako disabled. Přístup `admin.connectors`.

## Nové `.env` proměnné (doplň do `.env.example` i `.env.local`)
- `CONNECTOR_ENC_KEY` — klíč pro šifrování tokenů.
- `MARKETING_SYNC_INTERVAL_MIN` — interval scheduleru (default 60).
- `MARKETING_BACKFILL_FROM` — datum backfillu (default `2025-01-01`).

## Konvence (dodržet)
Prisma 7 (`@/generated/prisma/client`, URL v `prisma.config.ts`), Auth.js v5 split
config, middleware `src/proxy.ts`, RBAC na backendu (`assertPermission`/`can`),
UI **česky**, registrace bez zásahu do jádra, anti-drift (kanonika + kpi jen na
jednom místě). Nezdvojuj logiku — znovupoužij vzory z master specu, tabulka v §1.

## Mimo rozsah
Reálné `sync()` adaptérů, OAuth flow, marketingové dashboardy (`mkt_ads`,
`mkt_analytics`), jakýkoli zásah do `stock`/`analytics`/`resellers`.

## Ověření (musí projít)
```bash
npm run db:migrate && npm run db:seed
npm run typecheck && npm run lint && npm run build
```
Plus ručně: přihlásit se, vidět novou sekci **Marketing** v menu (dle práv),
otevřít **Integrace**, přepnout projekt, vidět katalog karet (adaptéry „brzy"
disabled), spustit dry-run sync a vidět změnu stavu (processing→ok).

## Definition of Done
- Sekce Marketing v menu; obchodní moduly beze změny.
- `Project` (3 značky), konektor modely, kanonika + `kpi.ts`, scheduler s dry-run
  syncem a stavem, stránka Integrace s katalogem z registru.
- RBAC práva + šifrování tokenů; migrace + seed projdou.
- `typecheck`/`lint`/`build` zelené.
- **Aktualizuj `CLAUDE.md`** (nová marketing větev, nové modely a vzory, revize
  rozhodnutí o automatizaci pro marketing).
- Commit + PR z `feat/marketing-core`.
