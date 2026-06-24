import { LineChart, Users, MousePointerClick, Target, Info } from "lucide-react";

import { requirePermission } from "@/core/auth/session";
import { can } from "@/core/rbac/access";
import { getVisibleProjects } from "@/core/projects/project-scope";
import {
  loadAnalyticsData,
  MKT_ANALYTICS_VIEWALL,
} from "@/modules/mkt_analytics/data";
import { getProjectDateBounds } from "@/modules/mkt_ads/data";
import { resolvePeriod, DEFAULT_PERIOD } from "@/modules/mkt_ads/period";
import { AnalyticsToolbar } from "@/modules/mkt_analytics/components/analytics-toolbar";
import {
  VisitsChart,
  WeeklyVisitsChart,
} from "@/modules/mkt_analytics/components/analytics-charts";

const num = new Intl.NumberFormat("cs-CZ");
const fmtDate = (d: Date) => d.toLocaleDateString("cs-CZ", { timeZone: "UTC" });
const fmtPct = (v: number | null) =>
  v == null
    ? "—"
    : `${(v * 100).toLocaleString("cs-CZ", { maximumFractionDigits: 1 })} %`;

function KpiTile({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users;
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

export default async function WebAnalytikaPage({
  searchParams,
}: {
  searchParams: Promise<{ projekt?: string; obdobi?: string }>;
}) {
  const user = await requirePermission("mkt_analytics.view");
  const { projekt, obdobi = DEFAULT_PERIOD } = await searchParams;

  const projects = await getVisibleProjects(user, MKT_ANALYTICS_VIEWALL);
  const selected =
    projects.find((p) => p.klic === projekt) ?? projects[0] ?? null;

  const header = (
    <div className="flex items-start gap-3">
      <div className="flex size-10 items-center justify-center rounded-md bg-[var(--secondary)] text-[var(--secondary-foreground)]">
        <LineChart className="size-5" />
      </div>
      <div>
        <h1 className="text-2xl font-semibold">Web analytika</h1>
        <p className="text-[var(--muted-foreground)]">
          Návštěvnost, konverze a konverzní poměr z GA4 — per značka.
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
  const data = await loadAnalyticsData(selected.id, period.from, period.to);
  const { kpi } = data;
  const canExport = can(user, "mkt_analytics.export");

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

      <AnalyticsToolbar
        projects={projects}
        selectedKlic={selected.klic}
        period={period.key}
        canExport={canExport}
        exportQuery={exportQuery}
      />

      {/* KPI hlavička */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile
          icon={MousePointerClick}
          label="návštěvy"
          value={num.format(kpi.navstevy)}
        />
        <KpiTile icon={Users} label="uživatelé" value={num.format(kpi.uzivatele)} />
        <KpiTile
          icon={Target}
          label="konverze"
          value={num.format(kpi.konverze)}
        />
        <KpiTile
          icon={Target}
          label="konverzní poměr"
          value={fmtPct(kpi.konverzniPomer)}
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[var(--muted-foreground)]">
        <span>
          Období ({period.label}):{" "}
          <strong className="text-[var(--foreground)]">{rangeText}</strong>
        </span>
      </div>

      {!data.hasData ? (
        <div className="flex items-start gap-3 rounded-lg border border-[var(--border)] bg-[var(--muted)]/40 p-4 text-sm">
          <Info className="mt-0.5 size-4 shrink-0 text-[var(--muted-foreground)]" />
          <p className="text-[var(--muted-foreground)]">
            Za zvolené období nejsou žádná data. Připojte GA4 v{" "}
            <a className="underline" href="/integrace">
              Integraci
            </a>{" "}
            a počkejte na první synchronizaci.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <VisitsChart daily={data.daily} />
          <WeeklyVisitsChart weekly={data.weekly} />
        </div>
      )}
    </div>
  );
}
