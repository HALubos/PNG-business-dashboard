# Dávka 4 — Reklamní OAuth konektory (Meta, Google Ads, Sklik)

> **Prompt pro Claude Code.** Repo *Obchodní dashboard ACTIVENT365*.
> **NEŽ začneš:** přečti `CLAUDE.md` a `docs/marketing/navrh-architektury-marketing.md`.
> **Předpoklad:** Dávka 3 (`feat/marketing-ga4-analytics`) je smergovaná v `main`.

## Větev
`feat/marketing-ad-connectors` (z `main`). **Každý adaptér = vlastní commit.**

## Cíl dávky
Doplnit **náklady** z reklamních platforem → ROAS/PNO začnou sedět (tržby už máš
ze Shoptetu z dávky 2). Tři adaptéry, postupně, každý samostatně ověřitelný.

## Rozsah — pořadí: Google Ads → Meta Ads → Sklik
Pro každý adaptér (`kind: oauth_api`):
- OAuth flow dané platformy; client/app secrety z `.env` (viz níže). Refresh
  tokenů uvnitř adaptéru; tokeny **šifrovaně** (`CONNECTOR_ENC_KEY`).
- Účet/ID per projekt zadané v Integraci při připojení.
- `sync()` → denní `MetricFact`: `cost`, `impressions`, `clicks`, `conversions`
  (`source` = `google_ads` / `meta_ads` / `sklik`). Stránkování + rate-limity uvnitř.
- Backfill od `MARKETING_BACKFILL_FROM`. Zapnout příslušnou kartu v Integraci.

### B3 — `google_ads`
Google Ads API (developer token + OAuth). `.env`: `GOOGLE_OAUTH_CLIENT_ID/SECRET`
(sdílené s GA4), `GOOGLE_ADS_DEVELOPER_TOKEN`.

### B4 — `meta_ads`
Meta Marketing/Graph API. `.env`: `META_APP_ID`, `META_APP_SECRET`.

### B5 — `sklik`
Sklik API (token-based). `.env`: `SKLIK_API_TOKEN` (nebo per-projekt token v UI,
dle toho jak Sklik autorizuje).

## Konvence
Viz §1 master specu. Náklady se v `kpi.ts` jen sčítají napříč `source` ad platforem
— žádná nová KPI logika mimo `kpi.ts`. Adaptéry vrací jen kanonické metriky.

## Mimo rozsah
Srovnávače (Heureka/Zboží/Glami), affiliate (RTB House/CJ), e-mail, sociální organic,
AI analýza — zůstávají v katalogu jako „brzy".

## Ověření (po každém adaptéru)
```bash
npm run db:migrate && npm run db:seed   # jen pokud adaptér přidal migraci
npm run typecheck && npm run lint && npm run build
```
Ručně: připojit platformu přes OAuth, sync proběhne, na stránce Reklamní výkon
přibudou náklady dané platformy a **ROAS/PNO sedí** (tržby Shoptet / náklady).

## Definition of Done
- Tři reklamní adaptéry plní náklady; ROAS/PNO správné; „náklady dle platformy"
  ukazuje reálné rozpady.
- Každý adaptér samostatný commit; `typecheck`/`lint`/`build` zelené.
- Aktualizuj `CLAUDE.md` (tři reklamní adaptéry + jejich secrety).
- PR z `feat/marketing-ad-connectors`.
