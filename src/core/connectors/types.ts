import type {
  Connector,
  ConnectorKind,
  ConnectorType,
} from "@/generated/prisma/client";
import type { CanonicalMetric } from "./metrics";

// ─────────────────────────────────────────────────────────────
// Abstrakce konektoru. Adaptér nese i KATALOGOVÁ metadata — z nich se vykreslí
// stránka Integrace (každý nový adaptér tak přidá svou kartu sám, bez zásahu do
// běhové smyčky; stejná filozofie jako registr modulů).
// ─────────────────────────────────────────────────────────────

export type ConnectorCategory =
  | "reklama" // Google/Meta Ads, Sklik, RTB House, CJ Affiliate
  | "analytika" // GA4, Search Console, Microsoft Clarity
  | "eshop_trzby" // Shoptet, Shopify, WooCommerce, Upgates… (přebíjí GA4 tržby)
  | "srovnavace" // Heureka, Zboží.cz, Glami, Srovnáme
  | "email" // Ecomail, SmartEmailing
  | "social" // YouTube, Google Business Profile
  | "ostatni"; // Počasí apod.

/** Lidské popisky kategorií (seskupení karet na stránce Integrace). */
export const CATEGORY_LABELS: Record<ConnectorCategory, string> = {
  reklama: "Reklama",
  analytika: "Analytika",
  eshop_trzby: "E-shop / tržby",
  srovnavace: "Srovnávače",
  email: "E-mail",
  social: "Sociální sítě",
  ostatni: "Ostatní",
};

/** Pořadí kategorií ve výpisu. */
export const CATEGORY_ORDER: ConnectorCategory[] = [
  "eshop_trzby",
  "reklama",
  "analytika",
  "srovnavace",
  "email",
  "social",
  "ostatni",
];

export interface ConnectorAdapter {
  type: ConnectorType;
  kind: ConnectorKind;
  // ── katalog (stránka Integrace) ──
  nazev: string; // "Google", "Shoptet"
  popis: string; // "Google Ads, GA4 a Shopping."
  icon: string; // klíč ikony/loga (mapováno v UI)
  category: ConnectorCategory;
  /** Přebíjí tržby z GA4? (true pro `eshop_trzby` zdroje.) */
  overridesRevenue?: boolean;
  /**
   * Adaptér zatím nemá reálnou implementaci `sync()` (placeholder „brzy").
   * Na stránce Integrace se zobrazí jako disabled.
   */
  comingSoon?: boolean;
  /** Stáhne a znormalizuje data od `since` do kanonických metrik. */
  sync(ctx: {
    connector: Connector;
    since: Date | null;
  }): Promise<CanonicalMetric[]>;
}
