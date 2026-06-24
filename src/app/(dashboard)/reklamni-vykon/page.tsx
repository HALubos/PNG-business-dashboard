import {
  Megaphone,
  Coins,
  TrendingUp,
  Percent,
  Target,
  ShoppingBag,
  Layers,
  Banknote,
  Info,
} from "lucide-react";

import { requirePermission } from "@/core/auth/session";
import { can } from "@/core/rbac/access";
import { getVisibleProjects } from "@/core/projects/project-scope";
import {
  loadAdsData,
  getProjectDateBounds,
  MKT_ADS_VIEWALL,
} from "@/modules/mkt_ads/data";
import { resolvePeriod, DEFAULT_PERIOD } from "@/modules/mkt_ads/period";
import { AdsToolbar } from "@/modules/mkt_ads/components/ads-toolbar";
import {
  CostVsRevenueChart,
  CostByPlatformChart,
  WeeklyCompareChart,
} from "@/modules/mkt_ads/components/ads-charts";

const czk = new Intl.NumberFormat("cs-CZ", {
  style: "currency",
  currency: "CZK",
  maximumFractionDigits: 0,
});
const num = new Intl.NumberFormat("cs-CZ");
const fmtDate = (d: Date) => d.toLocaleDateString("cs-CZ", { timeZone: "UTC" });
const fmtRoas = (v: number | null) =>
  v == null ? "—" : `${v.toLocaleString("cs-CZ", { maximumFractionDigits: 2 })}×`;
const fmtPct = (v: number | null) =>
  v == null
    ? "—"
    : `${(v * 100).toLocaleString("cs-CZ", { maximumFractionDigits: 1 })} %`;

const REVENUE_SOURCE_LABEL: Record<string, string> = {
  eshop: "e-shop (Shoptet)",
  ga4: "GA4",
  zadny: "žádný zdroj",
};

function Kpi({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Coins;
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

export default async function ReklamniVykonPage({
  searchParams,
}: {
  searchParams: Promise<{ projekt?: string; obdobi?: string }>;
}) {
  const user = await requirePermission("mkt_ads.view");
  const { projekt, obdobi = DEFAULT_PERIOD } = await searchParams;

  const projects = await getVisibleProjects(user, MKT_ADS_VIEWALL);
  const selected =
    projects.find((p) => p.klic === projekt) ?? projects[0] ?? null;

  const header = (
    <div className="flex items-start gap-3">
      <div className="flex size-10 items-center justify-center rounded-md bg-[var(--secondary)] text-[var(--secondary-foreground)]">
        <Megaphone className="size-5" />
      </div>
      <div>
        <h1 className="text-2xl font-semibold">Reklamní výkon</h1>
        <p className="text-[var(--muted-foreground)]">
          Tržby, náklady, ROAS a PNO napříč platformami — per značka.
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
  const data = await loadAdsData(selected.id, period.from, period.to);
  const { kpi } = data;
  const canExport = can(user, "mkt_ads.export");

  const exportQuery = `&projekt=${encodeURIComponent(
    selected.klic,
  )}&obdobi=${encodeURIComponent(period.key)}`;

  const rangeText =
    period.from && period.to
      ? `${fmtDate(period.from)} – ${fmtDate(period.to)}`
      : "celé období";

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {header}

      <AdsToolbar
        projects={projects}
        selectedKlic={selected.klic}
        period={period.key}
        canExport={canExport}
        exportQuery={exportQuery}
      />

      {/* KPI hlavička */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={Coins} label="tržby" value={czk.format(kpi.trzby)} />
        <Kpi icon={Banknote} label="náklady" value={czk.format(kpi.naklady)} />
        <Kpi icon={TrendingUp} label="ROAS" value={fmtRoas(kpi.roas)} />
        <Kpi icon={Percent} label="PNO" value={fmtPct(kpi.pno)} />
        <Kpi
          icon={Target}
          label="konverzní poměr"
          value={fmtPct(kpi.konverzniPomer)}
        />
        <Kpi icon={ShoppingBag} label="konverze" value={num.format(kpi.konverze)} />
        <Kpi
          icon={Layers}
          label="reklamních platforem"
          value={num.format(data.platformCount)}
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[var(--muted-foreground)]">
        <span>
          Období ({period.label}):{" "}
          <strong className="text-[var(--foreground)]">{rangeText}</strong>
        </span>
        <span>
          Zdroj tržeb:{" "}
          <strong className="text-[var(--foreground)]">
            {REVENUE_SOURCE_LABEL[kpi.zdrojTrzeb]}
          </strong>
        </span>
      </div>

      {!data.hasData ? (
        <div className="flex items-start gap-3 rounded-lg border border-[var(--border)] bg-[var(--muted)]/40 p-4 text-sm">
          <Info className="mt-0.5 size-4 shrink-0 text-[var(--muted-foreground)]" />
          <p className="text-[var(--muted-foreground)]">
            Za zvolené období nejsou žádná data. Připojte Shoptet (a reklamní
            konektory) v{" "}
            <a className="underline" href="/integrace">
              Integraci
            </a>{" "}
            a počkejte na první synchronizaci.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <CostVsRevenueChart daily={data.daily} />
          <div className="grid gap-4 lg:grid-cols-2">
            <CostByPlatformChart byPlatform={data.byPlatform} />
            <WeeklyCompareChart weekly={data.weekly} />
          </div>
        </div>
      )}
    </div>
  );
}
