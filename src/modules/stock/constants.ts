// Naše vlastní e-shopy — v Price Checku vystupují jako „odběratelé", ale jsou to
// naše značky. Označí se jako vlastní a do logiky příležitostí se nepočítají.
export const OWN_SHOP_DOMAINS = [
  "pinguin.cz",
  "activent.cz",
  "acepac.bike",
  "pinguin-shop.cz",
];

// Známé hodnoty dostupnosti: z Price Checku (§5.2) + z feedů odběratelů.
// `vyprodáno` = explicitní „out of stock" z feedu (≠ „neuvedeno"/null = neznámé).
export const KNOWN_AVAILABILITY_STATES = [
  "skladem",
  "do 3 dnů",
  "do týdne",
  "two_weeks",
  "do měsíce",
  "info v obchodu",
  "vyprodáno",
];

// Default „dostupné" stavy — vše ostatní = kandidát na nabídku (§3.7, §5.4).
export const DEFAULT_AVAILABLE_STATES = ["skladem", "do 3 dnů"];

// Lidský popisek pro technické hodnoty.
export const AVAILABILITY_LABELS: Record<string, string> = {
  two_weeks: "do 14 dnů",
};

export function availabilityLabel(value: string | null | undefined): string {
  if (!value) return "neuvedeno";
  return AVAILABILITY_LABELS[value] ?? value;
}

/** Je doména naším vlastním e-shopem? */
export function isOwnShop(domain: string): boolean {
  return OWN_SHOP_DOMAINS.includes(domain.trim().toLowerCase());
}
