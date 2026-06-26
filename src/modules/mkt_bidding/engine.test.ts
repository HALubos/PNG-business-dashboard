import { test } from "node:test";
import assert from "node:assert/strict";

import { computeBid, roundToStep, type BiddingProductInput } from "./engine";
import { DEFAULT_BIDDING_CONFIG, loadBiddingConfig } from "./config";

const cfg = DEFAULT_BIDDING_CONFIG; // targetRoas 3.0 → cíl PNO 0,333

/** Pomocník: produkt s rozumnými defaulty, přepisovatelnými v testu. */
function product(over: Partial<BiddingProductInput> = {}): BiddingProductInput {
  return {
    itemId: "SKU1",
    name: "Test produkt",
    internalCategory: "Spací pytle",
    clicks: 0,
    cost: 0,
    orders: 0,
    revenue: 0,
    price: 1000,
    available: true,
    floorCpc: 1.0,
    marginPct: 0.7,
    maxCpa: null,
    currentCpc: null,
    ...over,
  };
}

test("roundToStep zaokrouhluje na krok 0,01", () => {
  assert.equal(roundToStep(3.3337, 0.01), 3.33);
  assert.equal(roundToStep(3.335, 0.01), 3.34);
  assert.equal(roundToStep(5, 0.01), 5);
});

test("nedostupný produkt → žádný bid (skip)", () => {
  const r = computeBid(product({ available: false, clicks: 100, orders: 5, revenue: 5000 }), cfg);
  assert.equal(r.proposedCpc, null);
  assert.equal(r.action, "skip");
});

test("chybí floor → skip", () => {
  const r = computeBid(product({ floorCpc: null }), cfg);
  assert.equal(r.proposedCpc, null);
  assert.equal(r.action, "skip");
});

test("chybí marže → skip", () => {
  const r = computeBid(product({ marginPct: null }), cfg);
  assert.equal(r.proposedCpc, null);
});

test("fáze A (bootstrap): clicks=0 → bezpečný bid v [floor, break-even]", () => {
  const r = computeBid(product({ clicks: 0, price: 1000, floorCpc: 1.0, marginPct: 0.7 }), cfg);
  assert.equal(r.phase, "A");
  assert.notEqual(r.proposedCpc, null);
  const rpcEst = cfg.bootstrapBaselineConvRate * 1000; // 10
  const breakEven = 0.7 * rpcEst; // 7
  // cpc = clamp(max(floor, targetPno*rpcEst), floor, breakEven) = clamp(max(1, 3.333), 1, 7) = 3.33
  assert.ok(r.proposedCpc! >= 1.0 && r.proposedCpc! <= breakEven);
  assert.equal(r.proposedCpc, roundToStep((1 / 3) * rpcEst, 0.01));
});

test("fáze A: chybí cena → skip", () => {
  const r = computeBid(product({ clicks: 0, price: null }), cfg);
  assert.equal(r.proposedCpc, null);
});

test("fáze B: PNO nad cílem → snížení, v mantinelech (≤ break-even)", () => {
  // clicks 100, orders 4, revenue 4000 → rpc 40, break-even 28; cost 1600 → PNO 0,40 > 0,333
  const r = computeBid(
    product({ clicks: 100, orders: 4, revenue: 4000, cost: 1600, floorCpc: 2, marginPct: 0.7 }),
    cfg,
  );
  assert.equal(r.phase, "B");
  const rpc = 40;
  const breakEven = 0.7 * rpc; // 28
  const target = (1 / 3) * rpc; // 13.33
  assert.equal(r.proposedCpc, roundToStep(target, 0.01));
  assert.ok(r.proposedCpc! <= breakEven, "nikdy nad break-even");
  assert.ok(r.proposedCpc! >= 2, "nikdy pod floor");
});

test("fáze B: target nikdy nepřekročí break-even (tvrdý strop)", () => {
  // Vysoký cíl by chtěl víc, ale break-even = margin*rpc je strop.
  const r = computeBid(
    product({ clicks: 50, orders: 10, revenue: 5000, cost: 200, floorCpc: 1, marginPct: 0.2, maxCpa: null }),
    loadBiddingConfig(2.5), // agresivnější cíl
  );
  const rpc = 5000 / 50; // 100
  const breakEven = 0.2 * rpc; // 20
  assert.ok(r.proposedCpc! <= breakEven + 1e-9);
});

test("fáze B: ≥ pause_after_clicks_no_order bez objednávky → sraz na floor + pause", () => {
  const r = computeBid(
    product({ clicks: 80, orders: 0, revenue: 0, cost: 240, floorCpc: 1.5, marginPct: 0.7 }),
    cfg,
  );
  assert.equal(r.action, "pause");
  assert.equal(r.proposedCpc, 1.5);
});

test("fáze B: záporná marže → skip (neziskové)", () => {
  const r = computeBid(
    product({ clicks: 100, orders: 2, revenue: 2000, cost: 100, marginPct: -0.6, floorCpc: 1 }),
    cfg,
  );
  assert.equal(r.proposedCpc, null);
});

test("floor nad break-even → skip", () => {
  const r = computeBid(
    product({ clicks: 50, orders: 5, revenue: 1000, cost: 100, marginPct: 0.7, floorCpc: 50 }),
    cfg,
  );
  // rpc=20, break-even=14, floor 50 > 14 → skip
  assert.equal(r.proposedCpc, null);
});

test("denní limit změny ±max_daily_change_pct vůči currentCpc", () => {
  // Cíl by byl 13.33, ale current 5 → max +25 % = 6.25
  const r = computeBid(
    product({ clicks: 100, orders: 4, revenue: 4000, cost: 1600, floorCpc: 1, marginPct: 0.7, currentCpc: 5 }),
    cfg,
  );
  assert.ok(r.proposedCpc! <= 5 * 1.25 + 1e-9, "nepřekročí denní limit nahoru");
  assert.equal(r.proposedCpc, roundToStep(6.25, 0.01));
  assert.equal(r.action, "increase");
  assert.ok(r.changePct! > 0);
});

test("revenue=0 ve fázi B se nestane (spadne do fáze A nebo pause)", () => {
  // clicks pod prahem, žádné objednávky → fáze A bootstrap
  const r = computeBid(product({ clicks: 5, orders: 0, revenue: 0, price: 800 }), cfg);
  assert.equal(r.phase, "A");
  assert.notEqual(r.proposedCpc, null);
});

test("proposedCpc nikdy nespadne pod floor po zaokrouhlení", () => {
  const r = computeBid(
    product({ clicks: 0, price: 100, floorCpc: 0.33, marginPct: 0.7 }),
    cfg,
  );
  assert.ok(r.proposedCpc! >= 0.33);
});
