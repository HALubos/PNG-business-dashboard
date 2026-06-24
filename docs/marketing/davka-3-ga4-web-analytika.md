# Dávka 3 — GA4 (oauth_api) + modul Web analytika

> **Prompt pro Claude Code.** Repo *Obchodní dashboard ACTIVENT365*.
> **NEŽ začneš:** přečti `CLAUDE.md` a `docs/marketing/navrh-architektury-marketing.md`.
> **Předpoklad:** Dávka 2 (`feat/marketing-shoptet-ads`) je smergovaná v `main`.

## Větev
`feat/marketing-ga4-analytics` (z `main`).

## Cíl dávky
První **OAuth** konektor (GA4) a modul **Web analytika**. Zároveň ověřit, že
pravidlo priority tržeb funguje: kde je připojený Shoptet, jeho tržby **přebíjejí**
GA4; kde Shoptet není, tržby padají na GA4.

## Rozsah
### B2 — Adaptér `ga4` (`kind: oauth_api`)
- OAuth flow Google (Analytics Data API). Client ID/secret z `.env`
  (`GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`). Refresh tokenů řeš
  uvnitř adaptéru; tokeny ukládej **šifrovaně** (`CONNECTOR_ENC_KEY`).
- GA4 `propertyId` per projekt (zadá se v Integraci při připojení).
- `sync()` → denní `MetricFact` (`source = ga4`): `sessions`, `users`,
  `conversions`. GA4 revenue ukládej jen jako kontrolní metriku (ne jako `revenue`,
  pokud má projekt eshop konektor s `overridesRevenue`).
- Stránkování + rate-limity ošetři uvnitř adaptéru. Backfill od `MARKETING_BACKFILL_FROM`.
- V katalogu Integrace zapni Google/GA4 kartu (tlačítko „Připojit" → OAuth).

### C2 — Modul `mkt_analytics` „Web analytika" (group `marketing`)
- `src/core/modules/mkt_analytics/module.ts` + registr + seed práv.
- Stránka `/marketing/web-analytika`: návštěvnost (sessions/users), konverze,
  konverzní poměr, trend; filtr projekt + období; export. Čte přes `kpi.ts`/`MetricFact`,
  scope `project-scope.ts`.

## Konvence
Viz §1 master specu. `kpi.ts` zůstává jediným místem pro priority tržeb a KPI.
OAuth secrety zadává člověk do `.env`, ne automat.

## Mimo rozsah
Meta/Google Ads/Sklik (dávka 4), sociální sítě organic, AI analýza webu.

## Ověření
```bash
npm run db:migrate && npm run db:seed
npm run typecheck && npm run lint && npm run build
```
Ručně: připojit GA4 přes OAuth, sync proběhne, Web analytika ukazuje reálnou
návštěvnost; ověřit prioritu tržeb (projekt se Shoptetem → tržby ze Shoptetu,
ne z GA4).

## Definition of Done
- GA4 adaptér s OAuth + refresh + šifrovanými tokeny plní sessions/users/conversions.
- Modul Web analytika funkční; pravidlo priority tržeb ověřené.
- `typecheck`/`lint`/`build` zelené; předchozí moduly beze změny.
- Aktualizuj `CLAUDE.md` (GA4 adaptér + modul `mkt_analytics` + OAuth vzor).
- Commit + PR z `feat/marketing-ga4-analytics`.
