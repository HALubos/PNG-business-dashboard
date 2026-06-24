import type { ConnectorAdapter } from "../types";

// Shoptet — objednávky → denní tržby (autoritativní zdroj revenue). url_feed
// (permanentní URL s hashem, inkrement přes &updateTimeFrom=). Připojitelný už
// teď, ale reálné stahování/parsování objednávek přijde v další dávce (B1) —
// proto `sync()` zatím vrací prázdno (dry-run).
export const shoptetOrdersAdapter: ConnectorAdapter = {
  type: "shoptet_orders",
  kind: "url_feed",
  nazev: "Shoptet",
  popis: "Objednávky a tržby z Shoptetu (permanentní URL s hashem).",
  icon: "ShoppingCart",
  category: "eshop_trzby",
  overridesRevenue: true,
  // sync() zatím dry-run; reálná implementace = dávka B1.
  async sync() {
    return [];
  },
};
