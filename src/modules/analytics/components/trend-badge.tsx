import { ArrowDown, ArrowUp, Minus } from "lucide-react";

/**
 * Trend dle snapshotů (verzovaný sklad): ↑ +N zeleně / ↓ −N červeně / – jinak.
 * delta === null → předchozí snapshot neexistuje (trend skrytý).
 */
export function TrendBadge({
  delta,
  prevDate,
}: {
  delta: number | null;
  prevDate?: string | null;
}) {
  const title = prevDate ? `Trend vs ${prevDate}` : "Trend dle snapshotů";

  if (delta === null) {
    return (
      <span className="text-[var(--muted-foreground)]" title="Bez předchozího snapshotu">
        –
      </span>
    );
  }
  if (delta > 0) {
    return (
      <span
        className="inline-flex items-center gap-0.5 font-medium text-[var(--success)] tabular-nums"
        title={title}
      >
        <ArrowUp className="size-3.5" />+{delta}
      </span>
    );
  }
  if (delta < 0) {
    return (
      <span
        className="inline-flex items-center gap-0.5 font-medium text-[var(--destructive)] tabular-nums"
        title={title}
      >
        <ArrowDown className="size-3.5" />
        {delta}
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-0.5 text-[var(--muted-foreground)] tabular-nums"
      title={title}
    >
      <Minus className="size-3.5" />0
    </span>
  );
}
