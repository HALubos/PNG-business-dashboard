import { getConnectorAdapter } from "@/core/connectors/registry";
import type { ConnectorType } from "@/generated/prisma/client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { DayPoint, PlatformCost, WeekPoint } from "../data";

// Lehké grafy bez externí knihovny (server-render, CSS sloupce). Náklady jsou
// v této dávce nulové (přijdou reklamní konektory) — graf to korektně ukáže.

const czk = new Intl.NumberFormat("cs-CZ", {
  style: "currency",
  currency: "CZK",
  maximumFractionDigits: 0,
});

const fmtDay = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("cs-CZ", {
    day: "numeric",
    month: "numeric",
    timeZone: "UTC",
  });

function platformLabel(source: ConnectorType): string {
  return getConnectorAdapter(source)?.nazev ?? source;
}

/** Legenda: barva + popisek. */
function Legend() {
  return (
    <div className="flex items-center gap-4 text-xs text-[var(--muted-foreground)]">
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-sm bg-[var(--success)]" /> Tržby
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-sm bg-[var(--primary)]" /> Náklady
      </span>
    </div>
  );
}

/** Dvojice sloupců (tržby/náklady) pro jeden bod v čase. */
function PairColumn({
  label,
  revenue,
  cost,
  max,
}: {
  label: string;
  revenue: number;
  cost: number;
  max: number;
}) {
  // Nulová hodnota = nulová výška (jinak by 0 Kč mělo viditelný proužek).
  const h = (v: number) =>
    v > 0 && max > 0 ? Math.max(2, Math.round((v / max) * 100)) : 0;
  const title = `${label} — tržby ${czk.format(revenue)}, náklady ${czk.format(cost)}`;
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1" title={title}>
      <div className="flex h-28 w-full items-end justify-center gap-0.5">
        <div
          className="w-1/2 max-w-3 rounded-t-sm bg-[var(--success)]"
          style={{ height: `${h(revenue)}%` }}
        />
        <div
          className="w-1/2 max-w-3 rounded-t-sm bg-[var(--primary)]"
          style={{ height: `${h(cost)}%` }}
        />
      </div>
      <span className="w-full truncate text-center text-[10px] text-[var(--muted-foreground)]">
        {label}
      </span>
    </div>
  );
}

export function CostVsRevenueChart({ daily }: { daily: DayPoint[] }) {
  const max = Math.max(0, ...daily.map((d) => Math.max(d.revenue, d.cost)));
  // Příliš mnoho dnů → zhuštíme popisky (každý sloupec stejně nese tooltip).
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">Náklady vs. tržby (denně)</CardTitle>
        <Legend />
      </CardHeader>
      <CardContent>
        {daily.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--muted-foreground)]">
            Žádná data za zvolené období.
          </p>
        ) : (
          <div className="flex items-end gap-0.5 overflow-x-auto pb-1">
            {daily.map((d) => (
              <PairColumn
                key={d.date}
                label={fmtDay(d.date)}
                revenue={d.revenue}
                cost={d.cost}
                max={max}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function CostByPlatformChart({ byPlatform }: { byPlatform: PlatformCost[] }) {
  const max = Math.max(0, ...byPlatform.map((p) => p.cost));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Náklady dle platformy</CardTitle>
      </CardHeader>
      <CardContent>
        {byPlatform.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--muted-foreground)]">
            Zatím žádné reklamní náklady — připoj reklamní konektory (Google Ads,
            Meta, Sklik) v Integraci.
          </p>
        ) : (
          <div className="space-y-2">
            {byPlatform.map((p) => (
              <div key={p.source} className="flex items-center gap-3">
                <span className="w-24 shrink-0 truncate text-sm">
                  {platformLabel(p.source)}
                </span>
                <div className="h-5 flex-1 overflow-hidden rounded-sm bg-[var(--muted)]">
                  <div
                    className="h-full rounded-sm bg-[var(--primary)]"
                    style={{
                      width: max > 0 ? `${Math.max(2, (p.cost / max) * 100)}%` : "0%",
                    }}
                  />
                </div>
                <span className="w-28 shrink-0 text-right text-sm tabular-nums">
                  {czk.format(p.cost)}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function WeeklyCompareChart({ weekly }: { weekly: WeekPoint[] }) {
  const max = Math.max(0, ...weekly.map((w) => Math.max(w.revenue, w.cost)));
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">Týdenní srovnání</CardTitle>
        <Legend />
      </CardHeader>
      <CardContent>
        {weekly.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--muted-foreground)]">
            Žádná data za zvolené období.
          </p>
        ) : (
          <div className="flex items-end gap-2 overflow-x-auto pb-1">
            {weekly.map((w) => (
              <PairColumn
                key={w.label}
                label={w.label.replace(/^\d+-/, "")}
                revenue={w.revenue}
                cost={w.cost}
                max={max}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
