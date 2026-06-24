import type { ConnectorAdapter } from "../types";

// Google Analytics 4 — návštěvnost (sessions, users) a konverze. OAuth API.
// Placeholder „brzy" — OAuth flow a reálný sync přijdou v další dávce (B2).
export const ga4Adapter: ConnectorAdapter = {
  type: "ga4",
  kind: "oauth_api",
  nazev: "Google Analytics 4",
  popis: "Návštěvnost a konverze z GA4.",
  icon: "LineChart",
  category: "analytika",
  comingSoon: true,
  async sync() {
    return [];
  },
};
