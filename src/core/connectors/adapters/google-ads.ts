import type { ConnectorAdapter } from "../types";

// Google Ads — náklady, imprese, prokliky, konverze. OAuth API.
// Placeholder „brzy" — OAuth flow a reálný sync přijdou v další dávce (B3).
export const googleAdsAdapter: ConnectorAdapter = {
  type: "google_ads",
  kind: "oauth_api",
  nazev: "Google Ads",
  popis: "Náklady, prokliky a konverze z Google Ads.",
  icon: "Megaphone",
  category: "reklama",
  comingSoon: true,
  async sync() {
    return [];
  },
};
