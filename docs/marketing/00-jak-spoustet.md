# Jak spouštět marketingové dávky v Claude Code

Postup, jak z těchto promptů dostat hotovou marketingovou větev dashboardu —
spolehlivě a po kontrolovatelných krocích.

## Co je v balíčku
- `navrh-architektury-marketing.md` — **master spec** (sdílený kontext, neměnit za běhu).
- `davka-1-jadro.md` — Fáze A: jádro + Integrace.
- `davka-2-shoptet-reklamni-vykon.md` — Shoptet tržby + modul Reklamní výkon.
- `davka-3-ga4-web-analytika.md` — GA4 + modul Web analytika.
- `davka-4-reklamni-konektory.md` — Meta / Google Ads / Sklik.

## Krok 0 — Umísti soubory do repa (jednorázově)
Zkopíruj všechny tyto `.md` do repa, ať na ně Claude Code i ty vidíte:
```
docs/marketing/
  navrh-architektury-marketing.md
  davka-1-jadro.md
  davka-2-shoptet-reklamni-vykon.md
  davka-3-ga4-web-analytika.md
  davka-4-reklamni-konektory.md
```
Commitni je do `main`. (Prompty na master spec odkazují cestou
`docs/marketing/navrh-architektury-marketing.md` — když dáš jinam, uprav odkaz.)

## Krok 1 — Příprava prostředí
```bash
colima start          # Docker démon (po restartu PC znovu)
docker compose up -d  # lokální PostgreSQL
npm install
```

## Krok 2 — Spouštěj dávky POSTUPNĚ (1 → 2 → 3 → 4)
Dávky na sebe navazují; další začni až po smergování předchozí. Pro **každou** dávku:

1. **Nová, čistá session Claude Code.** (Čistý kontext = míň driftu. Nesnaž se
   protlačit víc dávek jednou session.)
2. Vytvoř větev dle hlavičky dávky, např.:
   ```bash
   git switch -c feat/marketing-core
   ```
3. Do Claude Code vlož **přesně jednu** zprávu ve smyslu:
   > Přečti `CLAUDE.md` a `docs/marketing/navrh-architektury-marketing.md`,
   > pak proveď přesně `docs/marketing/davka-1-jadro.md`. Drž se rozsahu a
   > Definition of Done. Nic mimo rozsah neřeš.
4. Nech doběhnout. Pak **zkontroluj diff** a nech projít ověření z dané dávky:
   ```bash
   npm run db:migrate && npm run db:seed
   npm run typecheck && npm run lint && npm run build
   npm run dev   # a proklikat ruční ověření z DoD
   ```
5. Když DoD sedí → commit, PR, merge do `main`. Teprve pak další dávka.

## Krok 3 — Secrets a credentials (děláš TY, ne agent)
Citlivé hodnoty nikdy nediktuj agentovi do kódu — vlož je sám do `.env.local`:
- **Dávka 1:** `CONNECTOR_ENC_KEY`, `MARKETING_SYNC_INTERVAL_MIN`,
  `MARKETING_BACKFILL_FROM`.
- **Dávka 2:** Shoptet permanentní URL se zadává v UI (Integrace), ne do `.env`.
- **Dávka 3:** `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`; GA4
  `propertyId` per projekt v UI.
- **Dávka 4:** `GOOGLE_ADS_DEVELOPER_TOKEN`, `META_APP_ID`, `META_APP_SECRET`,
  `SKLIK_API_TOKEN`.

OAuth „Připojit" tlačítka v Integraci proklikáš ty (přihlášení k účtům dělá člověk).

## Tipy pro spolehlivý běh
- **Jedna dávka = jedna větev = jedna session.** Nejdůležitější pravidlo.
- Když dávka 1 přijde moc velká, pусť nejdřív jen **A1 (skupiny menu)** jako malý
  zahřívací commit, pak zbytek A.
- Vždy nech agenta **nejdřív přečíst `CLAUDE.md` + master spec** — drží anti-drift.
- Po každé dávce nech agenta **aktualizovat `CLAUDE.md`** (je to v DoD) — další
  dávka pak naváže na aktuální stav.
- Když se něco rozbije, nevracej se promptem „oprav vše"; popiš konkrétní selhání
  a nech opravit v rámci téže větve.
- Drž `main` vždy zelený (build prochází), ať se dá kdykoli předvádět.

## Výsledek po všech dávkách
Marketingová sekce v menu se stránkou **Integrace** (katalog konektorů per značka),
moduly **Reklamní výkon** a **Web analytika** nad reálnými daty: tržby ze Shoptetu,
náklady z Meta/Google Ads/Sklik, návštěvnost z GA4, KPI ROAS/PNO/konverzní poměr.
