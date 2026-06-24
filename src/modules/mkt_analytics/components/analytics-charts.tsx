import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { VisitDayPoint, VisitWeekPoint } from "../data";

// Lehké grafy bez externí knihovny (server-render, CSS sloupce) — návštěvnost.
// Vzor jako ads-charts.tsx; dvojice sloupců = návštěvy (sessions) vs. uživatelé.

const num = new Intl.NumberFormat("cs-CZ");

const fmtDay = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("cs-CZ", {
    day: "numeric",
    month: "numeric",
    timeZone: "UTC",
  });

/** Legenda: barva + popisek. */
function Legend() {
  return (
    <div className="flex items-center gap-4 text-xs text-[var(--muted-foreground)]">
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-sm bg-[var(--primary)]" /> Návštěvy
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-sm bg-[var(--success)]" /> Uživatelé
      </span>
    </div>
  );
}

/** Dvojice sloupců (návštěvy/uživatelé) pro jeden bod v čase. */
function PairColumn({
  label,
  sessions,
  users,
  max,
}: {
  label: string;
  sessions: number;
  users: number;
  max: number;
}) {
  const h = (v: number) =>
    v > 0 && max > 0 ? Math.max(2, Math.round((v / max) * 100)) : 0;
  const title = `${label} — návštěvy ${num.format(sessions)}, uživatelé ${num.format(users)}`;
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1" title={title}>
      <div className="flex h-28 w-full items-end justify-center gap-0.5">
        <div
          className="w-1/2 max-w-3 rounded-t-sm bg-[var(--primary)]"
          style={{ height: `${h(sessions)}%` }}
        />
        <div
          className="w-1/2 max-w-3 rounded-t-sm bg-[var(--success)]"
          style={{ height: `${h(users)}%` }}
        />
      </div>
      <span className="w-full truncate text-center text-[10px] text-[var(--muted-foreground)]">
        {label}
      </span>
    </div>
  );
}

export function VisitsChart({ daily }: { daily: VisitDayPoint[] }) {
  const max = Math.max(0, ...daily.map((d) => Math.max(d.sessions, d.users)));
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">Návštěvnost (denně)</CardTitle>
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
                sessions={d.sessions}
                users={d.users}
                max={max}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function WeeklyVisitsChart({ weekly }: { weekly: VisitWeekPoint[] }) {
  const max = Math.max(0, ...weekly.map((w) => Math.max(w.sessions, w.users)));
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">Týdenní trend</CardTitle>
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
                sessions={w.sessions}
                users={w.users}
                max={max}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
