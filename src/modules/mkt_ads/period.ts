// ─────────────────────────────────────────────────────────────
// Období pro filtr modulu „Reklamní výkon". Sdílené stránkou i exportem, aby
// výběr seděl 1:1. Výchozí = „vše" (jistota, že na testovacích datech něco uvidíš).
// ─────────────────────────────────────────────────────────────

export type PeriodKey = "30" | "90" | "letos" | "vse";

export const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "30", label: "30 dní" },
  { key: "90", label: "90 dní" },
  { key: "letos", label: "Letos" },
  { key: "vse", label: "Vše" },
];

export const DEFAULT_PERIOD: PeriodKey = "vse";

export function isPeriodKey(v: string): v is PeriodKey {
  return PERIODS.some((p) => p.key === v);
}

/** Půlnoc UTC daného dne. */
function utcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export interface ResolvedPeriod {
  key: PeriodKey;
  label: string;
  from: Date | null; // inkluzivní (null = bez dolní hranice)
  to: Date | null; // inkluzivní (null = bez horní hranice)
}

/**
 * Přeloží klíč období na rozsah dnů. `bounds` = skutečné min/max dat projektu
 * (pro „vše" a pro popis rozsahu). Relativní okna končí dneškem.
 */
export function resolvePeriod(
  key: string,
  bounds: { min: Date | null; max: Date | null },
): ResolvedPeriod {
  const k: PeriodKey = isPeriodKey(key) ? key : DEFAULT_PERIOD;
  const label = PERIODS.find((p) => p.key === k)!.label;
  const today = utcDay(new Date());

  if (k === "vse") {
    return { key: k, label, from: bounds.min, to: bounds.max };
  }
  if (k === "letos") {
    return {
      key: k,
      label,
      from: new Date(Date.UTC(today.getUTCFullYear(), 0, 1)),
      to: today,
    };
  }
  const days = k === "30" ? 30 : 90;
  const from = new Date(today);
  from.setUTCDate(from.getUTCDate() - (days - 1));
  return { key: k, label, from, to: today };
}
