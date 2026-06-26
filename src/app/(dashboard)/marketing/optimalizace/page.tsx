import { Gauge, ListChecks, Banknote, Link2, Ban, Info } from "lucide-react";

import { requirePermission } from "@/core/auth/session";
import { can } from "@/core/rbac/access";
import { getVisibleProjects } from "@/core/projects/project-scope";
import { getProjectDateBounds } from "@/modules/mkt_ads/data";
import { resolvePeriod, DEFAULT_PERIOD } from "@/modules/mkt_ads/period";
import { loadBiddingData, MKT_BIDDING_VIEWALL } from "@/modules/mkt_bidding/data";
import { isTargetRoas } from "@/modules/mkt_bidding/config";
import { BiddingToolbar } from "@/modules/mkt_bidding/components/bidding-toolbar";
import { BiddingTable } from "@/modules/mkt_bidding/components/bidding-table";

const czk = new Intl.NumberFormat("cs-CZ", {
  style: "currency",
  currency: "CZK",
  maximumFractionDigits: 0,
});
const num = new Intl.NumberFormat("cs-CZ");
const fmtDate = (d: Date) => d.toLocaleDateString("cs-CZ", { timeZone: "UTC" });

function Kpi({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Gauge;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-3">
      <div className="flex size-9 items-center justify-center rounded-md bg-[var(--secondary)] text-[var(--secondary-foreground)]">
        <Icon className="size-4" />
      </div>
      <div className="leading-tight">
        <div className="text-lg font-semibold tabular-nums">{value}</div>
        <div className="text-xs text-[var(--muted-foreground)]">{label}</div>
      </div>
    </div>
  );
}

export default async function OptimalizacePage({
  searchParams,
}: {
  searchParams: Promise<{ projekt?: string; obdobi?: string; roas?: string }>;
}) {
  const user = await requirePermission("mkt_bidding.view");
  const { projekt, obdobi = DEFAULT_PERIOD, roas } = await searchParams;
  const targetRoas = roas && isTargetRoas(Number(roas)) ? Number(roas) : 3.0;

  const projects = await getVisibleProjects(user, MKT_BIDDING_VIEWALL);
  const selected = projects.find((p) => p.klic === projekt) ?? projects[0] ?? null;

  const header = (
    <div className="flex items-start gap-3">
      <div className="flex size-10 items-center justify-center rounded-md bg-[var(--secondary)] text-[var(--secondary-foreground)]">
        <Gauge className="size-5" />
      </div>
      <div>
        <h1 className="text-2xl font-semibold">Optimalizace srovnávačů</h1>
        <p className="text-[var(--muted-foreground)]">
          Návrhy optimálního CPC pro Heureku v mantinelech — ke kontrole a exportu do e-shopu.
        </p>
      </div>
    </div>
  );

  if (!selected) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        {header}
        <p className="rounded-lg border border-[var(--border)] bg-[var(--muted)]/40 px-4 py-6 text-sm text-[var(--muted-foreground)]">
          Žádné projekty. Spusťte seed (`npm run db:seed`).
        </p>
      </div>
    );
  }

  const bounds = await getProjectDateBounds(selected.id);
  const period = resolvePeriod(obdobi, bounds);
  const data = await loadBiddingData(
    selected.id,
    selected.klic,
    period.from,
    period.to,
    targetRoas,
  );
  const { summary } = data;

  const canExport = can(user, "mkt_bidding.export");
  const canEdit = can(user, "mkt_bidding.edit");
  const exportQuery = `&projekt=${encodeURIComponent(selected.klic)}&obdobi=${encodeURIComponent(
    period.key,
  )}&roas=${targetRoas}`;
  const rangeText =
    period.from && period.to ? `${fmtDate(period.from)} – ${fmtDate(period.to)}` : "celé období";

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {header}

      <BiddingToolbar
        projects={projects}
        selectedKlic={selected.klic}
        selectedProjectId={selected.id}
        period={period.key}
        targetRoas={targetRoas}
        canExport={canExport}
        canEdit={canEdit}
        exportQuery={exportQuery}
      />

      {/* KPI hlavička */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={ListChecks} label="návrhů s bidem" value={num.format(summary.withBid)} />
        <Kpi icon={Gauge} label="změn (zvýšit/snížit/pauza)" value={num.format(summary.changes)} />
        <Kpi icon={Banknote} label="odhad denní útraty" value={czk.format(summary.estDailySpend)} />
        <Kpi
          icon={Link2}
          label="spárováno feed ↔ API"
          value={summary.pairingRatePct == null ? "—" : `${summary.pairingRatePct} %`}
        />
        <Kpi icon={Ban} label="bez bidu (pauza/skip)" value={num.format(summary.pausedOrSkipped)} />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[var(--muted-foreground)]">
        <span>
          Období ({period.label}):{" "}
          <strong className="text-[var(--foreground)]">{rangeText}</strong>
        </span>
        <span>
          Cíl ROAS:{" "}
          <strong className="text-[var(--foreground)]">{targetRoas.toLocaleString("cs-CZ")}×</strong>
        </span>
        <span>
          Katalog:{" "}
          <strong className="text-[var(--foreground)]">{num.format(data.catalogCount)} produktů</strong>
          {data.catalogRefreshedAt
            ? ` (aktualizováno ${data.catalogRefreshedAt.toLocaleString("cs-CZ")})`
            : ""}
        </span>
      </div>

      {!data.hasCatalog ? (
        <div className="flex items-start gap-3 rounded-lg border border-[var(--border)] bg-[var(--muted)]/40 p-4 text-sm">
          <Info className="mt-0.5 size-4 shrink-0 text-[var(--muted-foreground)]" />
          <p className="text-[var(--muted-foreground)]">
            Zatím není načtený katalog produktů. Připojte Heureku (s URL katalogového feedu) v{" "}
            <a className="underline" href="/integrace">
              Integraci
            </a>{" "}
            a klikněte na <strong>Obnovit katalog</strong>. Bez katalogu (cena/kategorie/dostupnost)
            nelze počítat návrhy CPC.
          </p>
        </div>
      ) : data.proposals.length === 0 ? (
        <div className="flex items-start gap-3 rounded-lg border border-[var(--border)] bg-[var(--muted)]/40 p-4 text-sm">
          <Info className="mt-0.5 size-4 shrink-0 text-[var(--muted-foreground)]" />
          <p className="text-[var(--muted-foreground)]">
            Katalog je načtený, ale za zvolené období nejsou žádné návrhy. Počkejte na první
            synchronizaci Heureka konektoru (per-produktová data).
          </p>
        </div>
      ) : (
        <BiddingTable rows={data.proposals} />
      )}
    </div>
  );
}
