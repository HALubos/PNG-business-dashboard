# Dávka 5 — Heureka: konektor (srovnávač) + modul „Optimalizace srovnávačů" (bidding)

> **Prompt pro Claude Code.** Repo *Obchodní dashboard ACTIVENT365*.
> **NEŽ začneš:** přečti `CLAUDE.md` a `docs/marketing/navrh-architektury-marketing.md`.
> **Předpoklad:** Dávka 4 (`feat/marketing-ad-connectors`) je smergovaná v `main`.

## Větev
`feat/marketing-heureka-bidding` (z `main`). **Logické celky = samostatné commity** (konektor → per-produkt vrstva → bidding engine → modul/UI → output adaptéry).

## Cíl dávky
Dvě komplementární věci:
1. **Heureka jako reálný konektor** (`source = heureka`) — přestane být `comingSoon`, plní denní `MetricFact` (cost/clicks/conversions/revenue) → Heureka se objeví v modulu **Reklamní výkon** v ROAS/PNO vedle Googlu/Mety/Skliku.
2. **Nový modul `mkt_bidding` „Optimalizace srovnávačů"** — z per-produktových dat počítá optimální CPC (cenu za proklik) a generuje **importní soubor pro e-shop** (člověk zkontroluje a nahraje). Toto je první „akční" (write-out) marketingový modul — dosud marketing jen čte.

**Rozsah platforem v této dávce: jen Heureka.cz.** Zboží.cz/Glami later (architekturu dělej tak, aby šly přidat jako další `source` + output adaptér).

---

## 1. Heureka konektor — adaptér `heureka`

Vzor = **`sklik.ts`** (token-based; `kind: oauth_api`, credentials-based, BEZ OAuth roundtripu). Token (API klíč) zadává člověk v Integraci per projekt, ukládá se šifrovaně do `Connector.credentialsEnc`; fallback `.env` `HEUREKA_API_KEY` (per projekt přes UI je preferované).

### API (ověřeno na reálném účtu Pinguin)
- `GET https://api.heureka.group/v1/reports/conversions?date=YYYY-MM-DD`
- Hlavička `x-heureka-api-key: <KLÍČ>`.
- Vrací data **za jeden den** → pro období volej den po dni. Limit 10 000 volání/min (bohatě stačí).
- Struktura (zkráceno):
```json
{"conversions":[{
  "date":"2026-06-15",
  "product_card_id":"882448945",
  "on_bidded_position":false,
  "click_source":"product_detail",
  "shop_item":{"id":"214var1603","name":"Pinguin Pocket Chair Black / Blue"},
  "portal_category":{"id":2856},
  "visits":{"total":1,"free":0,"bidded":0,"not_bidded":1},
  "costs_with_vat":{"total":8.143,"bidded":0,"not_bidded":8.143},
  "costs_without_vat":{"total":6.73,"bidded":0,"not_bidded":6.73},
  "orders":{"total":0,"free":0,"bidded":0,"not_bidded":0},
  "revenue":{"total":0,"free":0,"bidded":0,"not_bidded":0}
}]}
```

### `sync()` → kanonické metriky (jako ostatní adaptéry)
- Agreguj přes produkty na **denní** `MetricFact` (`source = heureka`):
  - `cost` = Σ `costs_without_vat.total` (kanonický `revenue`/`cost` jsou BEZ DPH — viz §DPH v master specu; emituj i `cost_vat` z `costs_with_vat` pokud to dělají ostatní e-shop zdroje… náklady ad-zdrojů ale stačí bez DPH jako Sklik — drž konzistentní se `sklik`/`google_ads`).
  - `clicks` = Σ `visits.total`
  - `conversions` = Σ `orders.total`
  - `revenue` = Σ `revenue.total` — **jako KONTROLNÍ, NE `overridesRevenue`** (tržby přebíjí e-shop `shoptet_orders` dle pravidla priority v `kpi.ts`; Heureka je atribuovaná tržba srovnávače). Stejný princip jako GA4 fallback.
- Náklady se v `kpi.ts` jen **sčítají** napříč ad zdroji (`sumMetric "cost"`) — **žádná nová KPI logika**.
- Denní agregáty jsou úplné → přepis `MetricFact` per den je správný; konverze/tržby dozrávají → re-fetch `TRAILING_REFETCH_DAYS` (3) zpět. Cursor = nejnovější den. Backfill od `MARKETING_BACKFILL_FROM`.
- Tripwiry jako u ostatních (první sync bez dat = chyba; inkrement bez dat = prázdno).
- Zapni kartu Heureka v Integraci (`comingSoon: false`), token formulář + výběr projektu (jako Sklik).

---

## 2. Per-produktová vrstva (nutná pro bidding)

`MetricFact` je denní agregát per projekt/zdroj — bidding ale potřebuje **granularitu per produkt** (SKU: prokliky, náklad, objednávky, obrat + kategorie). **Návrh datového modelu nech na sobě dle zbytku repa** — preferuj generické a aditivní řešení (např. `ProductMetricFact`: `projectId + source + date + itemId + categoryId + clicks + cost + orders + revenue`), použitelné i pro budoucí Zboží/Glami a případnou SKU analytiku. Plní ho **stejný `heureka` sync** (vedle agregovaného `MetricFact`). Drž anti-drift: agregát pro KPI zůstává v `MetricFact`/`kpi.ts`, per-produkt je jen detailní vrstva.

**Párování:** `shop_item.id` (API) == `ITEM_ID` v katalogovém feedu; `portal_category.id` == `sekceId` v ceníku (viz §4).

---

## 3. Modul `mkt_bidding` „Optimalizace srovnávačů"

Skupina `marketing`, klíč `mkt_bidding`, stránka `/marketing/optimalizace` (nebo `/marketing/bidding`). Práva `mkt_bidding.view/viewall/export/edit`; Manažer má práva modulu, Admin vše. Přidej přes **registraci modulu** (`src/core/modules/.../module.ts` + řádek v registru + seed) — nikdy zásahem do jádra. Scope přes `project-scope.ts`.

### Vstupy bidding enginu (per produkt, okno `attribution_window_days`)
- z per-produktové vrstvy: `clicks`, `cost`, `orders`, `revenue`
- z **katalogového feedu** (§4): `price` (PRICE_VAT), `categoryId/cesta`, dostupnost
- `floor_cpc` z **ceníku** (§4)
- `margin%` z **margin tabulky** per kategorie (§4)
- `current_cpc` z minulého návrhu (drž historii navržených bidů pro denní diff a limit změny)

### Bidding logika (jádro) — služba `src/modules/mkt_bidding/engine.ts`
Pomocné: `rpc = revenue/clicks`, `break_even_cpc = margin% * rpc`, `target_cpc_pno = target_pno * rpc`.

**Tvrdé mantinely (vždy):**
- `cpc_min = floor_cpc` (pod tím produkt nejede v placeném režimu).
- `cpc_max = break_even_cpc` (nikdy do ztráty). Cílové PNO 0,20 je pod marží → `target_cpc_pno < cpc_max`.
- Max změna oproti včerejšku `±max_daily_change_pct` (default 0,25).
- Zaokrouhli na `round_to` (0,01).
- **Nedostupný produkt (sklad 0 / nevalidní delivery) → žádný bid** (vynech z importu).

**Fáze A — bootstrap** (`clicks < min_clicks_for_phase_b` nebo málo konverzí):
- `rpc_est = bootstrap_baseline_conv_rate * price` (default 0,01).
- `cpc = clamp( max(floor_cpc, target_pno * rpc_est), cpc_min, margin% * rpc_est )`.
- Cíl: dostat produkt mezi doporučené nabídky a začít sbírat data, bezpečně.

**Fáze B — optimalizace dle PNO** (dost dat):
- `PNO = cost/revenue`. `PNO > target` → sniž k `target_cpc_pno`; `PNO < target` → zvyš až k `min(target_cpc_pno, cpc_max)`.
- `clicks ≥ pause_after_clicks_no_order` (default 60) a `orders == 0` → sraž na `floor_cpc` (nebo navrhni vyřazení).
- Vždy mantinely + denní limit.

**Výchozí cíl = ROAS 3,0 (prostřední sloupec `PPC_nastavení.xlsx`, `max_CPA = AV zisk × 0,33`).** Engine z toho odvozuje strop CPC (ve fázi B `max_CPA × conv_rate`). `target_roas` konfigurovatelný (3,5 / 3,0 / 2,5), break-even z marže je vždy tvrdý strop nad rámec cíle.

**Defaultní parametry** (konfigurovatelné, ideálně `StockConfig`-obdoba `BiddingConfig` per projekt nebo env):
`target_roas=3.0`, `min_clicks_for_phase_b=30`, `attribution_window_days=30`, `bootstrap_baseline_conv_rate=0.01`, `max_daily_change_pct=0.25`, `pause_after_clicks_no_order=60`, `round_to=0.01`.

### UI a výstup
- Stránka: filtr **projekt (značka) + období**, tabulka (TanStack) produktů: název, kategorie, cena, prokliky/náklad/objednávky/obrat v okně, PNO, fáze (A/B), **staré CPC → navržené CPC**, % změna, **důvod**. Řádky barevně dle akce (zvýšit/snížit/pauza). KPI hlavička (počet změn, odhad denní útraty).
- **Schválení = export.** Tlačítko „Vygenerovat import" → route `src/app/api/mkt-bidding/export` (právo `mkt_bidding.export`) vrátí **importní soubor ve formátu daného e-shopu** (§5). Volitelně i `review` CSV/XLSX s důvody (jako stávající exporty stock/analytics).
- Žádné automatické nahrávání do e-shopu — člověk soubor stáhne a nahraje.

---

## 4. Konfigurace a podklady (config/seed)

### Katalogový feed (cena, kategorie, dostupnost)
- ebrana (Pinguin): `https://www.pinguin.cz/editor/filestore/io_folder/heureka.xml` (~4 MB, ~800 produktů). XML deklaruje `windows-1250`, ale obsah je reálně **UTF-8** — čti jako UTF-8, jinak mojibake. Tagy v `<SHOPITEM>`: `ITEM_ID`, `PRODUCTNAME`, `PRICE_VAT`, `CATEGORYTEXT` (`Heureka.cz | … | …`), `EAN`, `DELIVERY_DATE`. **`HEUREKA_CPC` ve feedu chybí** → bidding se řídí importním souborem, ne feedem. Parsuj **proudově** vzorem `src/modules/resellers/feed/feed-stream.ts`. Pro dostupnost lze využít `OurStockItem` (sklad dle EANu) — feed nese EAN i ITEM_ID, namapuj.
- Per platforma jiný feed/formát → **katalogový parser jako adaptér** (ebrana / shoptet), klidně přes obdobu `src/modules/resellers/feed/formats.ts` registru.

### Ceník prokliků Heureka = floor CPC
- Soubor `cenik-standard-cz.csv` (oddělovač `;`): 1. sl. `sekceId`, 2. `sekce`, dál sloupce = **cenová pásma produktu** (`0.00-20.00` … `500000.01-`); buňka = základní CPC pro kategorii × pásmo. `sekceId` == `portal_category.id`. Načti jako referenční tabulku (seed nebo `config/`). To je **spodní mez** CPC.
- `cenik-satelity-cz-*.csv` = satelity (Nejlepšíceny/Srovnánícen/CNC) — zatím jen referenčně.

### Margin / PNO podklady per kategorie — DODÁNO (`PPC_nastavení.xlsx`)
- Dva listy: `Nastavení PPC_Pinguin`, `Nastavení PPC_Activent` (Acepac zatím chybí — doplní se stejným formátem). Hlavička je na řádku s `Popisky řádků` (nahoře pár prázdných řádků — parsuj robustně, ne fixní offset).
- Sloupce per **interní kategorie** (NE Heureka sekceId!): `Popisky řádků` (název kategorie, např. Spací pytle, Batohy, Stany), `Množství`, `Prodejní cena` (součet), `Průměrná marže` (0–1, např. 0,70), `Breakeven_ROAS` (= 1/marže), `AV zisk` (průměrný hrubý zisk na produkt = prům. cena × marže), a **tři sloupce max nabídek** odpovídající cílům **ROAS 3,5 / 3,0 / 2,5** (≈ faktor `AV zisk × {0,30 / 0,33 / 0,40}`). Poslední řádek `Celkový součet` ignoruj.
- Použití v enginu: `Průměrná marže` → `break_even_cpc` (strop, nikdy do ztráty). Tři sloupce = **max CPA per kategorie** při zvolené agresivitě (ROAS 3,5/3,0/2,5). **Výchozí = ROAS 3,0 (prostřední sloupec, faktor 0,33).** Ve fázi B `cpc_max_target ≈ max_CPA × conv_rate`, ve fázi A přes `bootstrap_baseline_conv_rate`.
- ⚠️ **Mapování kategorií:** marže jsou po interních kategoriích značky, ne po `portal_category.id`. Nutná mapovací vrstva produkt → interní kategorie (z `CATEGORYTEXT` feedu nebo kategorie e-shopu) → marže. Udělej mapování konfigurovatelné (CSV/JSON), s fallbackem na celoznačkovou průměrnou marži, když produkt nesedne.

### Importní formát CPC (output) — DODÁNO (`ebrana_import.xls` + `ebrana_import.png`)
- ebrana import = **plný produktový update, 30 sloupců**, klíč = **sloupec 0 `Unikátní kód výrobku (SKU)`**. CPC sloupce:
  - **[28] `Maximální cena za proklik`** → Zboží.cz (obecné).
  - **[29] `Maximální cena za proklik - Heureka 2012`** → **Heureka CPC** (tohle plníme).
- Ostatní sloupce mohou zůstat prázdné (ve vzoru jsou prázdné) → pro CPC-only update zapiš jen `SKU` + sloupec [29]; ostatní hlavičky zachovej (prázdné hodnoty). Zachovej přesné pořadí a názvy hlavičky dle vzoru.
- ⚠️ **Ověř identifikátor:** import `SKU` (sl. 0) vs. `ITEM_ID` z feedu vs. `shop_item.id` z API — potvrď, že je to stejný klíč (feed nese i `PRODUCTNO`/`EAN`; pokud SKU ≠ ITEM_ID, mapuj přes feed).
- **shoptet** importní šablona CPC — zadavatel dodá později.
- → **Output adaptér per platforma** (`ebrana`/`shoptet`): vezme navržené bidy a zapíše do správného formátu. Pluggable jako katalogové parsery. Vzorové soubory přilož do repa mimo git (např. `data/sample/heureka/`): `ebrana_import.xls`, `PPC_nastavení.xlsx`, `cenik-standard-cz.csv`, `heureka.xml`.

---

## 5. Secrets & env
- `HEUREKA_API_KEY` (fallback) v `.env`; preferovaně per projekt v Integraci → `Connector.credentialsEnc` (šifrovaně, `CONNECTOR_ENC_KEY`).
- `.gitignore` na vzorové importy/feedy s reálnými daty.

## 6. Konvence (viz §1 master specu)
- Adaptér vrací **jen kanonické metriky**; KPI jen v `kpi.ts`. Per-produkt vrstva nemění KPI.
- Nový konektor = adaptér v `adapters/` + řádek v `registry.ts` (katalog i `sync.ts` čtou odtud).
- Sync na pozadí = `runConnectorSync`/`startConnectorSync` (detached, `syncStatus`, `cursor`, upsert).
- Nový modul = registrace + seed práv, žádný zásah do jádra.
- UI česky, Tailwind + shadcn/ui, TanStack Table, export přes `exceljs`.

## 7. Mimo rozsah
Zboží.cz/Glami (další dávka — připrav jen rozšiřitelnost), automatické nahrávání bidů do e-shopu, affiliate/e-mail/sociální organic. Bidding logika nad jiné srovnávače se v této dávce neimplementuje.

## 8. Ověření
```bash
npm run db:migrate && npm run db:seed     # pokud přibyla migrace / modul / config
npm run typecheck && npm run lint && npm run build
```
Ručně:
- Připoj Heureku (token) v Integraci → sync proběhne → v **Reklamním výkonu** přibudou náklady/konverze Heureky a ROAS/PNO sedí.
- Na stránce **Optimalizace** se zobrazí návrhy CPC v mantinelech (≥ ceník floor, ≤ break-even, ±denní limit), nedostupné produkty bez bidu, spárování feed↔API ≥ 95 %.
- Po dodání ebrana formátu „Vygenerovat import" stáhne soubor připravený k nahrání.

## 9. Definition of Done
- `heureka` adaptér plní `MetricFact` (Heureka v ROAS/PNO); per-produkt vrstva plněná; modul `mkt_bidding` s návrhy a exportem; output adaptér ebrana funkční (shoptet po dodání šablony).
- Žádný bid nad break-even; nedostupné bez bidu; engine pokryt testy (fáze A/B, mantinely, edge: clicks=0, revenue=0, sklad 0, chybí cena/kategorie).
- Logické celky samostatné commity; `typecheck`/`lint`/`build` zelené.
- Aktualizuj `CLAUDE.md` (nový konektor `heureka`, per-produkt vrstva, modul `mkt_bidding`, output adaptéry, secrets).
- PR z `feat/marketing-heureka-bidding`.

---

## Příloha — stav podkladů
1. ✅ **ebrana importní formát** — `ebrana_import.xls` (+ `ebrana_import.png`). Klíč SKU, Heureka CPC = sloupec [29].
2. ⬜ **shoptet** vzorová šablona importu CPC + způsob stažení katalogu (feed/API) — dodá zadavatel.
3. ✅ **Margin/PNO tabulky** — `PPC_nastavení.xlsx` (listy Pinguin + Activent; Acepac doplnit).
4. ⬜ **Heureka API klíče** ostatních projektů (Pinguin ověřen).
5. ✅ **Default cíl = ROAS 3,0** (prostřední sloupec, faktor 0,33). `bootstrap_baseline_conv_rate` (default 1 %) doladit po pár týdnech sběru.
6. ⬜ **Mapování interní kategorie → marže** pro produkty, které nesednou automaticky z `CATEGORYTEXT`.
