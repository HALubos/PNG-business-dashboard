// ─────────────────────────────────────────────────────────────
// Konfigurace bidding enginu (modul „Optimalizace srovnávačů"). Defaulty dle
// zadání Dávky 5; přepisovatelné přes .env (per-projekt BiddingConfig je možné
// rozšíření — zatím globální defaulty + env, anti-over-engineering).
//
//   target_roas                  3.0   (prostřední sloupec PPC_nastavení = faktor 0,33)
//   min_clicks_for_phase_b       30
//   attribution_window_days      30
//   bootstrap_baseline_conv_rate 0.01
//   max_daily_change_pct         0.25
//   pause_after_clicks_no_order  60
//   round_to                     0.01
// ─────────────────────────────────────────────────────────────

export interface BiddingConfig {
  /** Cílový ROAS (3.5 / 3.0 / 2.5). PNO cíl = 1/ROAS. */
  targetRoas: number;
  /** Min. prokliků v okně pro fázi B (optimalizace dle PNO). */
  minClicksForPhaseB: number;
  /** Atribuční okno (dní) pro vstupní metriky. */
  attributionWindowDays: number;
  /** Odhad konverzního poměru ve fázi A (bootstrap). */
  bootstrapBaselineConvRate: number;
  /** Max. denní změna bidu oproti minulému návrhu (±podíl). */
  maxDailyChangePct: number;
  /** Po tolika proklikech bez objednávky srazit na floor. */
  pauseAfterClicksNoOrder: number;
  /** Zaokrouhlení CPC (Kč). */
  roundTo: number;
}

export const DEFAULT_BIDDING_CONFIG: BiddingConfig = {
  targetRoas: 3.0,
  minClicksForPhaseB: 30,
  attributionWindowDays: 30,
  bootstrapBaselineConvRate: 0.01,
  maxDailyChangePct: 0.25,
  pauseAfterClicksNoOrder: 60,
  roundTo: 0.01,
};

/** Povolené cíle ROAS (UI přepínač agresivity). */
export const TARGET_ROAS_OPTIONS = [3.5, 3.0, 2.5] as const;
export type TargetRoas = (typeof TARGET_ROAS_OPTIONS)[number];

export function isTargetRoas(v: number): v is TargetRoas {
  return (TARGET_ROAS_OPTIONS as readonly number[]).includes(v);
}

function envNum(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/** Načte konfiguraci z defaultů + .env přepisů. `targetRoas` lze přebít (UI filtr). */
export function loadBiddingConfig(targetRoas?: number): BiddingConfig {
  return {
    targetRoas:
      targetRoas && Number.isFinite(targetRoas)
        ? targetRoas
        : envNum("BIDDING_TARGET_ROAS", DEFAULT_BIDDING_CONFIG.targetRoas),
    minClicksForPhaseB: envNum(
      "BIDDING_MIN_CLICKS_PHASE_B",
      DEFAULT_BIDDING_CONFIG.minClicksForPhaseB,
    ),
    attributionWindowDays: envNum(
      "BIDDING_ATTRIBUTION_WINDOW_DAYS",
      DEFAULT_BIDDING_CONFIG.attributionWindowDays,
    ),
    bootstrapBaselineConvRate: envNum(
      "BIDDING_BOOTSTRAP_CONV_RATE",
      DEFAULT_BIDDING_CONFIG.bootstrapBaselineConvRate,
    ),
    maxDailyChangePct: envNum(
      "BIDDING_MAX_DAILY_CHANGE_PCT",
      DEFAULT_BIDDING_CONFIG.maxDailyChangePct,
    ),
    pauseAfterClicksNoOrder: envNum(
      "BIDDING_PAUSE_AFTER_CLICKS_NO_ORDER",
      DEFAULT_BIDDING_CONFIG.pauseAfterClicksNoOrder,
    ),
    roundTo: envNum("BIDDING_ROUND_TO", DEFAULT_BIDDING_CONFIG.roundTo),
  };
}
