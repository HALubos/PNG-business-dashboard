import type { ConnectorAdapter } from "../types";

// Sklik (Seznam) — náklady, imprese, prokliky. OAuth / API token.
// Placeholder „brzy" — reálný sync přijde v další dávce (B5).
export const sklikAdapter: ConnectorAdapter = {
  type: "sklik",
  kind: "oauth_api",
  nazev: "Sklik",
  popis: "Náklady a prokliky ze Skliku (Seznam.cz).",
  icon: "Megaphone",
  category: "reklama",
  comingSoon: true,
  async sync() {
    return [];
  },
};
