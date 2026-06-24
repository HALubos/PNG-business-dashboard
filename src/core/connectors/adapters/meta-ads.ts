import type { ConnectorAdapter } from "../types";

// Meta Ads (Facebook/Instagram) — náklady, imprese, prokliky. OAuth API (Graph).
// Placeholder „brzy" — OAuth flow a reálný sync přijdou v další dávce (B4).
export const metaAdsAdapter: ConnectorAdapter = {
  type: "meta_ads",
  kind: "oauth_api",
  nazev: "Meta Ads",
  popis: "Náklady a výkon z Meta (Facebook / Instagram).",
  icon: "Megaphone",
  category: "reklama",
  comingSoon: true,
  async sync() {
    return [];
  },
};
