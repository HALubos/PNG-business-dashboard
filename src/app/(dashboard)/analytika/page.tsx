import Link from "next/link";
import {
  BarChart3,
  Info,
  Target,
  Coins,
  Users,
  Package,
  CalendarDays,
  ArrowUp,
  ArrowDown,
  Minus,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/core/auth/session";
import { can } from "@/core/rbac/access";
import { prisma } from "@/lib/prisma";
import { getActiveSnapshot } from "@/modules/stock/opportunities";
import { aggregateForUser } from "@/modules/analytics/aggregate";
import { AnalyticsTabs } from "@/modules/analytics/components/analytics-tabs";
import { AnalyticsFilters } from "@/modules/analytics/components/analytics-filters";

const czk = new Intl.NumberFormat("cs-CZ", {
  style: "currency",
  currency: "CZK",
  maximumFractionDigits: 0,
});
const fmtDate = (d: Date) => d.toLocaleDateString("cs-CZ", { timeZone: "UTC" });

function Kpi({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Target;
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

export default async function AnalytikaPage({
  searchParams,
}: {
  searchParams: Promise<{ producer?: string; kategorie?: string }>;
}) {
  const user = await requirePermission("analytics.view");
  const { producer = "", kategorie = "" } = await searchParams;

  const snapshot = await getActiveSnapshot();

  const header = (
    <div className="flex items-start gap-3">
      <div className="flex size-10 items-center justify-center rounded-md bg-[var(--secondary)] text-[var(--secondary-foreground)]">
        <BarChart3 className="size-5" />
      </div>
      <div>
        <h1 className="text-2xl font-semibold">Obchodní analytika</h1>
        <p className="text-[var(--muted-foreground)]">
          Koho oslovit první a co tlačit do nabídek.
        </p>
      </div>
    </div>
  );

  // Prázdný stav — bez aktivního snapshotu.
  if (!snapshot) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        {header}
        <Card>
          <CardContent className="flex flex-col items-start gap-3 py-8 text-[var(--muted-foreground)] sm:flex-row sm:items-center">
            <Info className="size-5 shrink-0" />
            <p className="flex-1">
              Zatím nejsou nahraná žádná data. Nahraj nejdřív Price Check v modulu
              Kontrola skladovosti.
            </p>
            <Button asChild variant="outline">
              <Link href="/skladovost">Přejít na Kontrolu skladovosti</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const [result, producerRows] = await Promise.all([
    aggregateForUser(user, { producer, kategorie }),
    prisma.product.findMany({
      where: { snapshotId: snapshot.id },
      distinct: ["producer"],
      select: { producer: true },
      orderBy: { producer: "asc" },
    }),
  ]);

  const producers = producerRows
    .map((p) => p.producer)
    .filter((p): p is string => !!p);

  const { summary, resellerLeaderboard, topProducts } = result;
  const trend = summary.trend;
  const prevDate = trend ? fmtDate(trend.previousSnapshotDate) : null;
  const canExport = can(user, "analytics.export");

  const exportParams = new URLSearchParams();
  if (producer) exportParams.set("producer", producer);
  if (kategorie) exportParams.set("kategorie", kategorie);
  const exportQuery = exportParams.toString() ? `&${exportParams.toString()}` : "";

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {header}

      {/* SOUHRN — aktuální stav (živý sklad) */}
      <div>
        <p className="mb-2 text-sm font-medium text-[var(--muted-foreground)]">
          Aktuální stav (živý sklad)
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            icon={Target}
            label="příležitostí celkem"
            value={summary.totalOpportunities.toLocaleString("cs-CZ")}
          />
          <Kpi
            icon={Coins}
            label="celková hodnota"
            value={czk.format(summary.totalValue)}
          />
          <Kpi
            icon={Users}
            label="odběratelů s příležitostí"
            value={summary.resellersWithOpportunities.toLocaleString("cs-CZ")}
          />
          <Kpi
            icon={Package}
            label="dotčených produktů"
            value={summary.productsWithOpportunities.toLocaleString("cs-CZ")}
          />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[var(--muted-foreground)]">
          <span className="flex items-center gap-1.5">
            <CalendarDays className="size-4" />
            aktivní snapshot:{" "}
            <strong className="text-[var(--foreground)]">
              {summary.snapshotDate ? fmtDate(summary.snapshotDate) : "—"}
            </strong>
          </span>
          {trend ? (
            <span className="flex items-center gap-1.5">
              trend dle snapshotů:
              {trend.deltaOpportunities > 0 ? (
                <span className="inline-flex items-center gap-0.5 font-medium text-[var(--success)]">
                  <ArrowUp className="size-4" />+{trend.deltaOpportunities}
                </span>
              ) : trend.deltaOpportunities < 0 ? (
                <span className="inline-flex items-center gap-0.5 font-medium text-[var(--destructive)]">
                  <ArrowDown className="size-4" />
                  {trend.deltaOpportunities}
                </span>
              ) : (
                <span className="inline-flex items-center gap-0.5">
                  <Minus className="size-4" />0
                </span>
              )}
              <span>vs {prevDate}</span>
            </span>
          ) : null}
        </div>
      </div>

      {/* Filtry (server-side — ovlivní KPI i obě tabulky) */}
      <AnalyticsFilters
        producers={producers}
        producer={producer}
        kategorie={kategorie}
      />

      {/* Záložky s tabulkami */}
      <AnalyticsTabs
        resellers={resellerLeaderboard}
        products={topProducts}
        prevDate={prevDate}
        canExport={canExport}
        exportQuery={exportQuery}
      />
    </div>
  );
}
