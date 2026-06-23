# Obchodní dashboard — ACTIVENT365

Modulární obchodní dashboard (jádro + zásuvné moduly). Stack: **Next.js 16 (App
Router, TS) · PostgreSQL + Prisma 7 · Auth.js v5 · Tailwind v4 + shadcn/ui ·
TanStack Table**.

Plné zadání: [`ZADANI-dashboard-v1.md`](./ZADANI-dashboard-v1.md) · pravidla:
[`CLAUDE.md`](./CLAUDE.md).

> **Stav:** Fáze 0 (skelet) + Fáze 1 (modul **Kontrola skladovosti**) + modul
> **Obchodní analytika** hotové. Login, RBAC, registr modulů, responzivní layout;
> import Price Check XLSX + živá skladovost z feedu, tabulka příležitostí, export
> XLSX/CSV; analytika (žebříčky + trend). Vario/Heureka/automatizace = fáze 2+.

---

## Požadavky

- **Node.js 20+** (vyvíjeno na 24)
- **Docker** (pro lokální PostgreSQL) — nebo vlastní PostgreSQL na `localhost:5432`

> **Docker bez Docker Desktop (macOS, přes Colima):** tento stroj používá
> headless Docker přes [Colima](https://github.com/abiosoft/colima). Jednorázová
> instalace: `brew install colima docker docker-compose`. Před prací spusť démona:
>
> ```bash
> colima start            # nastartuje Docker VM (po restartu počítače znovu)
> docker compose up -d    # spustí PostgreSQL
> ```
>
> Zastavení: `colima stop`. Stav: `colima status`.

## Rychlý start

```bash
# 1) Závislosti
npm install

# 2) Konfigurace prostředí
cp .env.example .env.local
#   → v .env.local nastav AUTH_SECRET:  openssl rand -base64 32
#   → nastav STOCK_FEED_URL (XML feed skladovosti, tajný hash)
#   (DATABASE_URL už odpovídá docker-compose.yml)

# 3) Lokální databáze
docker compose up -d            # PostgreSQL na localhost:5432

# 4) Schéma + data
npm run prisma:generate         # vygeneruje Prisma klienta (do src/generated)
npm run db:deploy               # aplikuje migraci (vytvoří tabulky)
npm run db:seed                 # admin + 3 zástupci + role/práva + modul stock

# 5) Vývojový server
npm run dev                     # http://localhost:3000
```

Po přihlášení tě appka přesměruje na rozcestník; v menu se zobrazí jen moduly, na
které máš právo.

## Přihlašovací údaje (po seedu)

Heslo bere seed z `.env.local` (`SEED_ADMIN_PASSWORD` / `SEED_REP_PASSWORD`),
default **`heslo123`**.

| Role     | E-mail                          |
| -------- | ------------------------------- |
| Admin    | `lubos@activent365.cz`          |
| Zástupce | `jan.novak@activent365.cz`      |
| Zástupce | `petr.svoboda@activent365.cz`   |
| Zástupce | `eva.dvorakova@activent365.cz`  |

> Manažerská role je nasazená v seedu s právy (`stock.view`, `stock.export`) a
> připravená k přiřazení uživateli.

## Co vyzkoušet (fáze 0)

1. **Přihlaš se jako admin** (`lubos@…`) → v menu uvidíš *Přehled*, *Kontrola
   skladovosti* i *Administrace*. V administraci je přehled uživatelů, rolí,
   modulů a auditní log (zaznamenává se i přihlášení).
2. **Přihlaš se jako zástupce** (`jan.novak@…`) → *Administrace* v menu **chybí**.
   Zkus ručně otevřít `/admin` → backend tě odmítne a přesměruje s hláškou o
   nedostatečném oprávnění (RBAC se vynucuje na serveru, ne jen v UI).
3. **Responzivita** → zúžit okno / mobil: navigace se schová do hamburger menu.
4. **Odhlášení** → přes menu uživatele vpravo nahoře.

## Užitečné příkazy

```bash
npm run dev            # vývojový server
npm run build          # produkční build
npm run typecheck      # kontrola typů (tsc --noEmit)
npm run db:migrate     # vytvořit/aplikovat migraci ve vývoji (prisma migrate dev)
npm run db:seed        # naplnit data
npm run db:reset       # zahodit a znovu vytvořit DB + seed
npm run db:studio      # Prisma Studio (prohlížeč DB)
```

## Architektura (jádro + moduly)

```
src/
├─ app/
│  ├─ (auth)/login/           # přihlášení (Auth.js credentials)
│  └─ (dashboard)/            # layout s navigací dle práv
│     ├─ page.tsx             # rozcestník
│     ├─ skladovost/          # MODUL stock (placeholder, fáze 1)
│     └─ admin/               # administrace (read-only přehled)
├─ core/
│  ├─ auth/                   # Auth.js config (split edge/node), session, hesla
│  ├─ modules/                # REGISTR MODULŮ (registry.ts) + definice modulů
│  └─ rbac/                   # oprávnění + helpery (can / assertPermission)
├─ components/
│  ├─ ui/                     # shadcn/ui komponenty
│  └─ dashboard/              # shell (sidebar/topbar, responzivní)
├─ lib/prisma.ts              # Prisma klient (pg driver adapter)
└─ generated/prisma/          # generovaný Prisma klient (mimo git)
prisma/
├─ schema.prisma              # jádro: User, Role, Permission, Module, …
├─ migrations/                # SQL migrace
└─ seed.ts                    # admin + zástupci + role/práva + moduly
```

### Jak přidat nový modul (bez zásahu do jádra)

1. Vytvoř `src/core/modules/<klic>/module.ts` s definicí (`ModuleDefinition`).
2. Přidej ho do pole v `src/core/modules/registry.ts` (jeden řádek).
3. Spusť `npm run db:seed` (zaregistruje modul a jeho oprávnění do DB).

Navigace, oprávnění i dlaždice na rozcestníku se vygenerují automaticky.

## Modul „Kontrola skladovosti" (fáze 1)

Najdeš ho v menu jako **Kontrola skladovosti** (`/skladovost`).

- **Import** (právo `stock.edit`): nahraj Price Check XLSX. Parser čte pevné
  sloupce + dynamicky detekuje opakující se bloky odběratelů (6 sloupců/blok) —
  doména se čte z buňky, ne z pozice sloupce (bloky jsou řazené dle ceny). Každý
  import = nový **verzovaný snapshot**, který se nastaví jako aktivní. Po importu
  je report (produkty, odběratelé, varování). Vzorový soubor: `data/sample/`.
- **Logika příležitostí** (§5.4): pro zvoleného odběratele se zobrazí produkty, kde
  `náš sklad > práh` **a** odběratel produkt listuje **a** jeho dostupnost není
  v množině „dostupných stavů" (default `skladem`, `do 3 dnů`).
- **Živá skladovost:** náš sklad se bere z XML feedu (`STOCK_FEED_URL`), párováno
  dle EANu. Aktualizace tlačítkem „Aktualizovat skladovost" (`stock.edit`) i
  automaticky při importu. Produkt mimo feed = 0 ks; tabulka ukazuje i „do 7 dnů".
- **Vlastní e-shopy** (`pinguin.cz, activent.cz, acepac.bike, pinguin-shop.cz`) jsou
  označené jako vlastní a mezi odběrateli se nenabízejí.
- **Tři bloky** u odběratele: 🟢 **Příležitosti** (akční, nahoře) · ⚪ **Už má od nás
  skladem** (sbalený, šedý — kontext) · ⚪ **Vyprodáno u nás** (sbalený; uvnitř
  odlišení 🔴 *restock kandidátů* = vyprodáno u nás i u odběratele). Počet i export
  jsou jen o příležitostech.
- **Tabulka** (TanStack): hledání, filtr značky, řazení, stránkování.
- **Export** (právo `stock.export`): XLSX nebo CSV přes `/api/stock/export`.
- **Nastavení** (právo `stock.admin`): množina dostupných stavů + práh skladu.
- **Rozsah dat:** Admin/Manažer (`stock.viewall`) vidí všechny odběratele; Zástupce
  jen své přiřazené (`RepCustomer`) — vynuceno i u exportu a výpočtu na backendu.

## Modul „Obchodní analytika" (`/analytika`)

Agregační vrstva nad logikou modulu `stock` (žádný nový zdroj ani import) — **koho
oslovit první** a **co tlačit do nabídek**.

- **KPI souhrn** (živý sklad): počet příležitostí, hodnota, odběratelů, produktů + datum snapshotu.
- **Žebříček odběratelů** a **top produkty napříč trhem** (TanStack: řazení, hledání, filtr značka/kategorie).
- **Trend** (porovnání aktivního a předchozího snapshotu) — počítaný z **verzovaného
  `Product.ourStock`** obou snapshotů, aby byl férový (živý feed je jen pro headline).
  ↑/↓/– u každého řádku; skryje se, když předchozí snapshot není.
- **Proklik** z odběratele rovnou do `/skladovost` na jeho akční seznam.
- **Export** žebříčků do XLSX/CSV (`analytics.export`), respektuje filtry i RBAC scope.
- **RBAC scope dat:** Admin/Manažer (`analytics.viewall`) vidí všechny odběratele,
  Zástupce jen své (`RepCustomer`) — sdílí helper s modulem `stock` (anti-drift).

## RBAC — model práv

- **Per modul + per akce:** `view` / `export` / `edit` / `admin`
  (klíč oprávnění např. `stock.view`).
- Práva se odvozují z **role** uživatele a nesou se v JWT session.
- Vynucení **na backendu**: `requirePermission()` v stránkách,
  `assertPermission()` v server akcích/handlerech. UI menu jen zrcadlí práva.
- **Viditelnost dat:** zástupce má přes `RepCustomer` přiřazené konkrétní
  odběratele (využije modul skladovosti ve fázi 1).

## Poznámky k technologiím

- **Prisma 7**: connection URL je v `prisma.config.ts` (migrace) a přes
  `@prisma/adapter-pg` v `src/lib/prisma.ts` (runtime). Klient se generuje do
  `src/generated/prisma` (Prisma 7 už negeneruje do `node_modules`).
- **Auth.js v5**: split konfigurace — `auth.config.ts` (edge-safe, pro proxy) a
  `auth.ts` (Node, s Prisma a Credentials providerem).
- **`.env.local`** čte Next.js i Prisma (ručně přes `dotenv` v `prisma.config.ts`
  a `prisma/seed.ts`).

## Co se zatím NEřeší (fáze 2+)

Vario, Heureka, automatické stahování Price Checku, produkční hosting, další
moduly. Viz §8 zadání.
