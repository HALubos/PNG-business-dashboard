# Zadání: Modulární obchodní dashboard — v1

> Specifikace pro vývoj v Claude Code. Dokument je zároveň referenčním zadáním
> i podkladem pro `CLAUDE.md` v repozitáři projektu.
>
> **Firma:** ACTIVENT365 (značky Pinguin, Acepac, Activent)
> **Stav:** návrh v1 · **Datum:** 22. 6. 2026

---

## 1. Proč to děláme (kontext a cíl)

Firma dnes řídí obchodní agendu přes e-maily a tabulky. Vzniká z toho nepřehledné
množství informací, ve kterých se obtížně orientuje. Cílem je nahradit roztříštěné
tabulky **jedním modulárním dashboardem**, do kterého se budou postupně přidávat
funkční moduly.

**První modul** = **Kontrola skladovosti**: obchodnímu zástupci ukázat produkty,
které jeho odběratel **vyprodal**, ale které **my jako výrobce máme skladem** — a
zástupce mu je tak může proaktivně nabídnout.

---

## 2. Glosář (závazná terminologie)

| Pojem | Význam |
|---|---|
| **Obchodní zástupce** | Uživatel dashboardu. Náš člověk, který jedná s odběrateli. |
| **Obchodník / odběratel** | Zákazník B2B — provozovatel e-shopu / kamenné prodejny, který od nás odebírá zboží. |
| **Modul** | Samostatná funkční jednotka dashboardu (např. Kontrola skladovosti). Lze zapínat/vypínat a řídit práva. |
| **My / výrobce** | ACTIVENT365 a naše značky (Pinguin, Acepac, Activent). |
| **Náš sklad** | B2B sklad výrobce, zdroj dat ve Variu. |
| **Sortiment odběratele** | Podmnožina našich produktů, kterou daný odběratel reálně prodává (ne každý bere vše). |

---

## 3. Klíčová rozhodnutí (potvrzeno se zadavatelem)

1. **Forma:** webová aplikace s přihlášením, multi-user, responzivní.
2. **Nasazení v1:** **lokálně** (běh na vlastním stroji) kvůli prototypu, který chce zadavatel ukazovat. Cílové produkční nasazení se vyřeší později.
3. **Stack:** **Next.js + PostgreSQL** (potvrzeno). DB pro v1 běží **lokálně** (Docker / lokální instalace).
4. **Strategie dat pro v1:** **Price Check export** jako hlavní zdroj, **ruční nahrání XLSX**. Vario a automatizace Price Checku se zatím **neřeší** (fáze 2+).
5. **Sortiment odběratele:** v1 **implicitně z Price Checku** (varianta A, §5.5).
6. **Uživatelé:** **3 obchodní zástupci**, **admin = Lubos** (zadavatel).
7. **Definice „skladem" u odběratele:** za dostupné se počítá **`skladem` i `do 3 dnů`**. Vše ostatní (`do týdne`, `two_weeks`, `do měsíce`, `info v obchodu`, chybí) = **nedostupné** → kandidát na nabídku.
8. **Zařízení:** **responzivní** — desktop v kanceláři i mobil/tablet u odběratele.

---

## 4. Architektura systému

### 4.1 Modularita (jádro celého návrhu)

Systém je **jádro (core) + zásuvné moduly**. Jádro řeší přihlášení, uživatele, role,
práva, navigaci a registr modulů. Každý modul je samostatný balík, který se
zaregistruje do jádra a přidá si vlastní stránky, oprávnění a (případně) datové
zdroje.

Požadavky:

- Přidání nového modulu **nesmí** vyžadovat zásah do jádra (jen registraci).
- Každý modul deklaruje svá **oprávnění** (např. `stock.view`, `stock.export`, `stock.admin`).
- Administrátor řídí, **kdo který modul vidí** a **jaká v něm má práva**.

### 4.2 Role a práva (RBAC)

Minimálně tři vestavěné role, rozšiřitelné:

| Role | Typický rozsah |
|---|---|
| **Admin** | Správa uživatelů, rolí, modulů, datových zdrojů a importů. Vidí vše. |
| **Manažer** | Vidí data všech zástupců/odběratelů, exporty, bez správy uživatelů. |
| **Obchodní zástupce** | Vidí jen své moduly a (volitelně) jen své přiřazené odběratele. |

Práva jsou **per modul + per akce** (view / export / edit / admin). Model musí umožnit
i přiřazení **konkrétních odběratelů** danému zástupci (viditelnost dat, ne jen modulů).

### 4.3 Doporučený technický stack

> Doporučení k potvrzení — vybráno s ohledem na rychlý vývoj v Claude Code,
> responzivitu a snadný hosting.

- **Frontend + backend:** Next.js (App Router, TypeScript) — jeden repozitář, SSR i API routes.
- **UI:** Tailwind CSS + shadcn/ui, responzivní (desktop/tablet/mobil).
- **Databáze:** PostgreSQL (přes Prisma ORM).
- **Auth:** Auth.js (NextAuth) — e-mail/heslo, příprava na firemní SSO.
- **Tabulky/filtrace:** TanStack Table (řazení, filtrování, stránkování velkých seznamů).
- **Import souborů:** parsování XLSX na serveru (např. `xlsx`/`exceljs`).
- **Nasazení v1:** **lokálně** — `next dev` + PostgreSQL přes Docker (`docker compose up`) nebo lokální instalace. Cílem je spustitelný prototyp k předvádění. Produkční hosting (VPS/PaaS, Docker image) se dořeší později; aplikace má být na hostingu nezávislá (konfigurace přes `.env`).

Alternativa, pokud preferuješ Python: FastAPI + React + PostgreSQL. Princip zůstává stejný.

### 4.4 Datový model (návrh jádra)

```
User(id, jmeno, email, heslo_hash, role_id, aktivni)
Role(id, nazev)
Module(id, klic, nazev, aktivni)
Permission(id, klic)                      // např. "stock.view"
RolePermission(role_id, permission_id)
UserModuleAccess(user_id, module_id)      // kdo vidí který modul (volitelné nad rámec rolí)
RepCustomer(user_id, reseller_id)         // přiřazení odběratelů zástupci
AuditLog(id, user_id, akce, entita, cas)  // kdo co kdy (importy, exporty, změny)
```

---

## 5. Modul 1 — Kontrola skladovosti

### 5.1 Co modul dělá (uživatelský příběh)

> Jako obchodní zástupce si vyberu odběratele a uvidím tabulku produktů, které
> **odběratel nemá skladem**, ale **my je skladem máme** — abych mu je při jednání
> mohl nabídnout. Tabulku můžu filtrovat, řadit a vyexportovat.

### 5.2 Vstupní data — Price Check export

Analyzovaný soubor (`hk-activent365-cz_...xlsx`) má jeden list a tuto strukturu:

**Levá část — náš produkt a náš sklad:**

| Sloupec | Význam | Použití |
|---|---|---|
| `Code` | náš kód produktu | identifikátor |
| `Producer` | značka (Pinguin / Acepac) | filtr |
| `Product` | název produktu | zobrazení |
| `Size` | velikost/varianta | zobrazení |
| `EAN` | **EAN kód** | **spojovací klíč** |
| `Category` / `Category breadcrumb` | kategorie | filtr |
| `Stock` | **naše skladová zásoba (ks)** | klíč pro logiku |
| `Sale price` / `Price` | naše cena | zobrazení |

**Pravá část — odběratelé (opakující se bloky 1.–50.):** pro každého odběratele
čtveřice sloupců:

- cena, **doména odběratele** (`affekt.cz`, `batac.cz`, …),
- `↑↓ Input price`, `↑↓ <datum>` (cenové změny),
- `Stock` (1 = skladem / 0 = není),
- `Availability` — textová dostupnost.

**Hodnoty dostupnosti nalezené v souboru:** `skladem`, `do 3 dnů`, `do týdne`,
`two_weeks`, `do měsíce`, `info v obchodu`.

> **Pozn.:** Mezi „odběrateli" jsou v exportu i **naše vlastní e-shopy** (např.
> `pinguin.cz`, `activent.cz`, `acepac.bike`, `pinguin-shop.cz`). Ty je třeba označit
> jako „vlastní" a v logice nabídky je nepočítat jako odběratele.

### 5.3 Reálná čísla z analyzovaného souboru (pro odhad rozsahu)

- **804 produktů** (Pinguin 677, Acepac 126).
- **597** produktů máme skladem, **206** vyprodáno (na naší straně).
- **122** různých odběratelských domén.
- Datum exportu v názvu listu: `21.6.2026`.

### 5.4 Logika modulu — „příležitosti k nabídce"

Pro zvoleného odběratele vyber produkty splňující **všechny** podmínky:

1. **My máme skladem** → `Stock` (náš) > 0 (práh konfigurovatelný, default > 0).
2. **Odběratel produkt prodává** (je v jeho sortimentu) → v exportu se u produktu
   objevuje jeho doména. *(Viz §5.5 k definici sortimentu.)*
3. **Odběratel nemá skladem** → jeho `Availability` **není** v množině dostupných
   stavů. **Za dostupné se počítá `skladem` i `do 3 dnů`.** Nedostupné (= kandidát na
   nabídku) jsou tedy: `do týdne`, `two_weeks`, `do měsíce`, `info v obchodu` a stav,
   kdy odběratel produkt nelistuje vůbec. Množina dostupných stavů musí jít
   **nastavit** v administraci (default = `skladem`, `do 3 dnů`).

**Výstup = tabulka příležitostí** se sloupci: produkt, EAN, značka, kategorie, naše
cena, náš sklad (ks), stav u odběratele, (volitelně) jeho poslední cena.

### 5.5 Ošetření „ne každý bere celý sortiment"

Klíčový bod. Možnosti, jak definovat sortiment odběratele (k rozhodnutí — viz §9):

- **A) Implicitně z Price Checku (v1, default):** odběratel „prodává" produkt, pokud
  se u produktu v exportu vyskytuje. Riziko: produkt, který má dlouhodobě vyprodaný
  a přestal listovat, z dat zmizí.
- **B) Explicitní sortiment:** udržovat per odběratel seznam EANů, které reálně bere
  (import/ruční správa). Přesnější, ale vyžaduje data o sortimentu.
- **C) Hybrid:** základ z Price Checku + možnost ruční korekce/výjimek.

v1 postavit na **A** s architekturou připravenou na **B/C**.

### 5.6 Import dat (v1 — ruční nahrání)

- Admin/zástupce nahraje XLSX přes UI. Systém soubor naparsuje, zvaliduje a uloží
  jako **datový snapshot** s datem importu (historie ⇒ pozdější trendy).
- Robustní parser: hlavička s opakujícími se bloky 1.–50., dynamický počet
  odběratelů, ošetření prázdných buněk a hodnot typu `N/A`.
- Po importu krátký report: počet produktů, počet odběratelů, varování.

### 5.7 UI modulu

- **Výběr odběratele** (rychlé hledání mezi 122 doménami) + **výběr značky/kategorie**.
- **Tabulka příležitostí** s řazením a filtry; rychlé filtry „jen skladem u nás",
  „podle značky".
- **Souhrn nahoře:** počet příležitostí, hodnota (volitelně), datum použitého snapshotu.
- **Export** do XLSX/CSV (právo `stock.export`) — podklad pro e-mail/jednání.
- Plně **responzivní** (scénář u odběratele na tabletu/mobilu).

---

## 6. Datové zdroje — současný stav a roadmapa

### 6.1 Price Check (v1)

Hlavní zdroj v1. **Ruční nahrání XLSX.**
**Úkol pro vývoj:** ověřit, zda Price Check nabízí **API nebo plánovaný export**,
aby se import dal později zautomatizovat (cron + stažení → import bez člověka).

### 6.2 Vario (náš sklad) — fáze 2

Vario **nemá nativní REST API**. Možné cesty napojení (od nejjednodušší):

1. **Export do CSV/XLSX** z Varia → import stejnou cestou jako Price Check (nejrychlejší).
2. **AVIS** (Altus Vario Integration Services) — oficiální webová služba (SOAP/JSON).
3. **Přímý SQL Server** dotaz nad DB Varia (Vario běží nad MS SQL).
4. **Vario Bridge** (3. strana, Go gateway) — zpřístupní data Varia přes REST.

**Úkol pro vývoj:** zjistit, jakou edici/licenci Varia firma má a zda je dostupné
AVIS, příp. přístup k SQL. Podle toho vybrat cestu. Pro v1 stačí export/import.

### 6.3 Skladovost odběratelů (Heureka) — fáze 2+

Dnes pokryto Price Checkem (dostupnost odběratelů už v exportu je). Do budoucna
zvážit přímý **Heureka feed/API** jako doplněk či alternativu — k rozmyšlení.

---

## 7. Nefunkční požadavky

- **Bezpečnost:** hesla hashovaná, role/práva vynucené na backendu (ne jen v UI), audit log akcí.
- **Data:** každý import = verzovaný snapshot; nic se nepřepisuje naslepo.
- **Výkon:** plynulé filtrování ~1000 produktů × 122 odběratelů.
- **Rozšiřitelnost:** přidání modulu bez zásahu do jádra.
- **Jazyk:** UI česky.

---

## 8. Fázování (doporučený postup)

| Fáze | Obsah |
|---|---|
| **0 — Skelet** | Jádro: auth, role/práva, registr modulů, prázdný dashboard, layout (responzivní). |
| **1 — Modul skladovosti (MVP)** | Ruční import Price Checku, výběr odběratele, tabulka příležitostí, export. |
| **2 — Automatizace + Vario** | Ověřit API Price Checku; napojit náš sklad z Varia (export → později AVIS/SQL). |
| **3 — Sortiment + historie** | Explicitní/hybridní sortiment odběratele (§5.5), trendy z historických snapshotů. |
| **4 — Další moduly** | Dle priorit firmy. |

---

## 9. Stav rozhodnutí

**Vyřešeno (viz §3):** nasazení v1 lokálně · stack Next.js + PostgreSQL (DB lokálně) ·
zdroj dat Price Check (ruční nahrání) · sortiment implicitně z Price Checku ·
3 zástupci + admin Lubos · dostupné stavy = `skladem` + `do 3 dnů`.

**Odloženo na fázi 2+ (teď neřešit):**

1. **Vario** — způsob napojení (export / AVIS / SQL / Bridge), edice a licence.
2. **Price Check** — jméno nástroje a možnost API / plánovaného exportu.
3. **Produkční hosting** — kde appka nakonec poběží a citlivost dat o odběratelích.

---

## 10. Příloha — mapování sloupců Price Check (pro parser)

- Pevné sloupce: `Nr., Code, Producer, Product, Size, EAN, Category, Stock, Sale price, Price`.
- Poté opakující se bloky odběratelů (1.–50.), každý blok = 6 sloupců:
  `[index], cena, doména, ↑↓ Input price, ↑↓ <datum>, Stock, Availability`
  (počet vyplněných bloků se liší produkt od produktu).
- Souhrnné sloupce na konci: `Price AVG, Price MIN, Price MAX, Prices count,
  Shop MIN, Cheaper prices [%], My price position, Diff from cheapest[%], Top,
  Category breadcrumb, Review count, Rating`.
- Spojovací klíč produktu napříč zdroji: **EAN**.
