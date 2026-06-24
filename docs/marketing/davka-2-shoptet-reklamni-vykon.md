# Dávka 2 — Shoptet (tržby) + modul Reklamní výkon

> **Prompt pro Claude Code.** Repo *Obchodní dashboard ACTIVENT365*.
> **NEŽ začneš:** přečti `CLAUDE.md` a `docs/marketing/navrh-architektury-marketing.md`.
> **Předpoklad:** Dávka 1 (`feat/marketing-core`) je smergovaná v `main`.

## Větev
`feat/marketing-shoptet-ads` (z `main`).

## Cíl dávky
První reálná data end-to-end: **tržby ze Shoptetu** a první marketingový dashboard
**Reklamní výkon**. Náklady jsou zatím nulové (přijdou v dávkách 3–4), ale tržby,
počty objednávek a celá KPI mechanika musí fungovat na reálných datech.

## Rozsah
### B1 — Adaptér `shoptet_orders` (`kind: url_feed`)
- Implementuj `sync()` adaptéru: stáhne Shoptet export objednávek z `connector.feedUrl`,
  inkrementálně přes `&updateTimeFrom=YYYY-MM-DD` (z `connector.cursor`).
- Parsuj **streamovaně** podle vzoru `src/modules/resellers/feed/feed-stream.ts`
  (bez DOM, zvládnout velké exporty).
- Agreguj na denní granularitu → `MetricFact` (`source = shoptet_orders`):
  `revenue` (suma) a `conversions` (počet objednávek). Nastav `overridesRevenue = true`.
- `cursor` = poslední zpracovaný `updateTime`. Respektuj limit Shoptetu
  „při stahování častěji než 1× za 15 min jen přes `updateTimeFrom`".
- Backfill od `MARKETING_BACKFILL_FROM` při prvním připojení (běží na pozadí).
- V katalogu Integrace zapni Shoptet kartu (formulář na vložení permanentní URL).

### C1 — Modul `mkt_ads` „Reklamní výkon" (group `marketing`)
- `src/core/modules/mkt_ads/module.ts` + řádek v `registry.ts` + seed práv.
- Stránka `/marketing/reklamni-vykon` (nebo `/reklamni-vykon`):
  - KPI hlavička z `kpi.ts`: **tržby, náklady, PNO, ROAS, konverzní poměr,
    konverze, počet platforem**.
  - Grafy: denní **náklady vs. tržby**, **náklady dle platformy**, týdenní srovnání.
  - Filtr: projekt (značka) + období. Export XLSX/CSV (právo `export`).
- Čte **výhradně** přes `kpi.ts` / `MetricFact`, scope přes `project-scope.ts`.
  Žádný přímý přístup k adaptérům.

## Konvence
Viz §1 master specu. `kpi.ts` je jediný zdroj pravdy pro KPI — neduplikuj výpočty
do komponent. Tržby ber přes pravidlo priority (eshop `overridesRevenue` → GA4).

## Mimo rozsah
OAuth adaptéry (GA4/Meta/Google/Sklik), modul Web analytika, jakýkoli zásah do
obchodních modulů.

## Ověření
```bash
npm run db:migrate && npm run db:seed
npm run typecheck && npm run lint && npm run build
```
Ručně: v Integraci připojit Shoptet (vložit testovací export URL), počkat na sync
(stav processing→ok), na stránce Reklamní výkon vidět reálné **tržby a konverze**
za zvolený projekt a období; export funguje.

## Definition of Done
- Shoptet adaptér plní denní tržby/konverze na reálných datech, s backfillem a
  inkrementem; stav syncu viditelný v Integraci.
- Modul Reklamní výkon zobrazuje KPI a grafy (náklady zatím 0), filtr projekt+období,
  export.
- `typecheck`/`lint`/`build` zelené; obchodní moduly beze změny.
- Aktualizuj `CLAUDE.md` (Shoptet adaptér + modul `mkt_ads`).
- Commit + PR z `feat/marketing-shoptet-ads`.
