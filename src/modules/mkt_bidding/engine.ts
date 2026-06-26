import type { BiddingConfig } from "./config";

// ─────────────────────────────────────────────────────────────
// Bidding engine — JÁDRO výpočtu optimálního CPC (cena za proklik) pro srovnávač.
// ČISTÁ funkce (žádné IO, žádná DB) → plně testovatelná. Vstup = per-produkt metriky
// v atribučním okně + katalog (cena, dostupnost) + ceník (floor) + marže. Výstup =
// návrh CPC s mantinely, fází a důvodem.
//
// TVRDÉ MANTINELY (vždy):
//   cpc_min = floor_cpc        (pod tím produkt nejede v placeném režimu)
//   cpc_max = break_even_cpc   (= marže% × RPC; NIKDY do ztráty)
//   |Δ| ≤ max_daily_change_pct oproti minulému návrhu
//   round_to (0,01)
//   nedostupný produkt → žádný bid (vynech z importu)
//
// FÁZE A (bootstrap): málo dat → bezpečně dostat produkt mezi doporučené nabídky.
// FÁZE B (PNO): dost dat → optimalizace k cílovému PNO (= 1/target_roas), v mantinelech.
// ─────────────────────────────────────────────────────────────

export type BiddingPhase = "A" | "B";
export type BiddingAction = "increase" | "decrease" | "pause" | "keep" | "skip";

/** Vstup enginu pro jeden produkt (metriky agregované za atribuční okno). */
export interface BiddingProductInput {
  itemId: string;
  name: string | null;
  internalCategory: string | null;
  // metriky v okně:
  clicks: number;
  cost: number;
  orders: number;
  revenue: number;
  // katalog:
  price: number | null; // PRICE_VAT
  available: boolean; // sklad > 0 / validní dodání
  // konfigurace per produkt:
  floorCpc: number | null; // z ceníku (sekce × cenové pásmo)
  marginPct: number | null; // 0–1 (z margin tabulky / fallback průměr značky)
  maxCpa: number | null; // max CPA per kategorie při zvoleném ROAS (volitelné)
  currentCpc: number | null; // minulý navržený bid (pro denní limit a směr)
}

export interface BiddingProposal {
  itemId: string;
  name: string | null;
  internalCategory: string | null;
  price: number | null;
  clicks: number;
  cost: number;
  orders: number;
  revenue: number;
  pno: number | null; // cost / revenue
  phase: BiddingPhase;
  currentCpc: number | null;
  proposedCpc: number | null; // null = bez bidu (skip / nedostupný / neziskový)
  changePct: number | null; // (proposed - current) / current
  action: BiddingAction;
  reason: string;
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

/** Zaokrouhlí na krok (např. 0,01). */
export function roundToStep(x: number, step: number): number {
  if (step <= 0) return x;
  return Math.round(x / step) * step;
}

function pct(value: number): number {
  // bezpečné zaokrouhlení procent na 4 desetinná místa (vyhne se plovoucí nepřesnosti)
  return Math.round(value * 1e4) / 1e4;
}

/**
 * Spočítá návrh CPC pro JEDEN produkt podle mantinelů a fáze. Čistá funkce.
 */
export function computeBid(
  p: BiddingProductInput,
  cfg: BiddingConfig,
): BiddingProposal {
  const base = {
    itemId: p.itemId,
    name: p.name,
    internalCategory: p.internalCategory,
    price: p.price,
    clicks: p.clicks,
    cost: p.cost,
    orders: p.orders,
    revenue: p.revenue,
    pno: p.revenue > 0 ? pct(p.cost / p.revenue) : null,
    currentCpc: p.currentCpc,
  };

  const skip = (reason: string): BiddingProposal => ({
    ...base,
    phase: "A",
    proposedCpc: null,
    changePct: null,
    action: "skip",
    reason,
  });

  // 1) Nedostupný produkt → žádný bid.
  if (!p.available) {
    return skip("Nedostupný (sklad 0 / nevalidní dodání) — bez bidu.");
  }
  // 2) Bez ceníkového floor nebo marže nelze bezpečně počítat.
  if (p.floorCpc == null) return skip("Chybí ceníkový floor CPC (kategorie) — bez bidu.");
  if (p.marginPct == null) return skip("Chybí marže kategorie — bez bidu.");

  const floor = p.floorCpc;
  const targetPno = 1 / cfg.targetRoas;

  // 3) ≥ pause_after_clicks_no_order proklik bez objednávky → sraz na floor.
  if (p.clicks >= cfg.pauseAfterClicksNoOrder && p.orders === 0) {
    return finalize(base, p, cfg, "B", floor, floor, "pause", floor, {
      reason: `≥ ${cfg.pauseAfterClicksNoOrder} prokliků bez objednávky → sraženo na floor (kandidát na vyřazení).`,
    });
  }

  const enoughData = p.clicks >= cfg.minClicksForPhaseB && p.orders > 0;

  if (enoughData) {
    // ── FÁZE B — optimalizace dle PNO ──
    const rpc = p.revenue / p.clicks; // tržba na proklik (skutečná)
    const breakEven = p.marginPct * rpc; // tvrdý strop (nikdy do ztráty)
    if (breakEven <= 0) {
      return skip("Break-even CPC ≤ 0 (záporná/nulová marže) — neziskové, bez bidu.");
    }
    if (floor > breakEven) {
      return skip("Floor CPC nad break-even — při floor je produkt ztrátový, bez bidu.");
    }
    let targetCpc = targetPno * rpc;
    if (p.maxCpa != null && p.maxCpa > 0) {
      const convRate = p.orders / p.clicks;
      targetCpc = Math.min(targetCpc, p.maxCpa * convRate); // kategoriální strop
    }
    const desired = clamp(targetCpc, floor, breakEven);
    const pno = p.cost / p.revenue;
    const action: BiddingAction = pno > targetPno ? "decrease" : "increase";
    return finalize(base, p, cfg, "B", floor, breakEven, action, desired, {});
  }

  // ── FÁZE A — bootstrap ──
  if (p.price == null || p.price <= 0) {
    return skip("Chybí cena produktu (fáze A potřebuje cenu pro odhad) — bez bidu.");
  }
  const rpcEst = cfg.bootstrapBaselineConvRate * p.price; // odhad tržby/proklik
  const breakEven = p.marginPct * rpcEst;
  if (breakEven <= 0) {
    return skip("Break-even CPC ≤ 0 (záporná marže) — neziskové, bez bidu.");
  }
  if (floor > breakEven) {
    return skip("Floor CPC nad break-even (odhad) — bez bidu.");
  }
  const desired = clamp(Math.max(floor, targetPno * rpcEst), floor, breakEven);
  return finalize(base, p, cfg, "A", floor, breakEven, "keep", desired, {
    reason: "Bootstrap: bezpečný bid k nasbírání dat (odhad konverze).",
  });
}

/** Aplikuje denní limit změny, zaokrouhlení, mantinely a dopočítá akci/důvod. */
function finalize(
  base: Pick<
    BiddingProposal,
    | "itemId"
    | "name"
    | "internalCategory"
    | "price"
    | "clicks"
    | "cost"
    | "orders"
    | "revenue"
    | "pno"
    | "currentCpc"
  >,
  p: BiddingProductInput,
  cfg: BiddingConfig,
  phase: BiddingPhase,
  floor: number,
  breakEven: number,
  intendedAction: BiddingAction,
  desiredCpc: number,
  opts: { reason?: string },
): BiddingProposal {
  let proposed = desiredCpc;

  // Denní limit změny oproti minulému návrhu.
  if (p.currentCpc != null && p.currentCpc > 0) {
    const lo = p.currentCpc * (1 - cfg.maxDailyChangePct);
    const hi = p.currentCpc * (1 + cfg.maxDailyChangePct);
    proposed = clamp(proposed, lo, hi);
  }

  // Zaokrouhlení a tvrdé mantinely (po zaokrouhlení znovu do [floor, breakEven]).
  proposed = roundToStep(proposed, cfg.roundTo);
  proposed = clamp(proposed, floor, breakEven);
  proposed = roundToStep(proposed, cfg.roundTo);
  // Pojistka: zaokrouhlení dolů nesmí spadnout pod floor.
  if (proposed < floor) proposed = roundToStep(floor, cfg.roundTo);

  const changePct =
    p.currentCpc != null && p.currentCpc > 0
      ? pct((proposed - p.currentCpc) / p.currentCpc)
      : null;

  let action = intendedAction;
  let reason = opts.reason ?? "";
  if (p.currentCpc != null && action !== "pause") {
    if (proposed > p.currentCpc) action = "increase";
    else if (proposed < p.currentCpc) action = "decrease";
    else action = "keep";
  }

  if (!reason) {
    if (action === "increase") {
      reason =
        phase === "B"
          ? `PNO pod cílem → zvýšit k cílovému CPC (cíl PNO ${(100 / cfg.targetRoas).toFixed(0)} %).`
          : "Zvýšení v rámci mantinelů.";
    } else if (action === "decrease") {
      reason =
        phase === "B"
          ? `PNO nad cílem → snížit k cílovému CPC (cíl PNO ${(100 / cfg.targetRoas).toFixed(0)} %).`
          : "Snížení k cílovému CPC.";
    } else {
      reason = "Beze změny (v cíli / v mantinelech).";
    }
  }

  return {
    ...base,
    phase,
    proposedCpc: proposed,
    changePct,
    action,
    reason,
  };
}

/** Spočítá návrhy pro všechny produkty. */
export function computeBids(
  inputs: BiddingProductInput[],
  cfg: BiddingConfig,
): BiddingProposal[] {
  return inputs.map((p) => computeBid(p, cfg));
}
