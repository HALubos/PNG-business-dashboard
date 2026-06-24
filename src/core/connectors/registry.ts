import type { ConnectorType } from "@/generated/prisma/client";
import type { ConnectorAdapter } from "./types";
import { shoptetOrdersAdapter } from "./adapters/shoptet-orders";
import { ga4Adapter } from "./adapters/ga4";
import { googleAdsAdapter } from "./adapters/google-ads";
import { metaAdsAdapter } from "./adapters/meta-ads";
import { sklikAdapter } from "./adapters/sklik";

// ─────────────────────────────────────────────────────────────
// REGISTR KONEKTORŮ
// Nový konektor = jeden řádek zde + jeho adaptér v ./adapters — žádný zásah do
// běhové smyčky ani do stránky Integrace (ta čte katalog z tohoto registru,
// stejně jako sync). Stejná filozofie jako registr modulů.
// ─────────────────────────────────────────────────────────────
const ADAPTERS: ConnectorAdapter[] = [
  shoptetOrdersAdapter,
  ga4Adapter,
  googleAdsAdapter,
  metaAdsAdapter,
  sklikAdapter,
];

/** Všechny zaregistrované adaptéry (pořadí = pořadí v poli). */
export function allConnectorAdapters(): ConnectorAdapter[] {
  return [...ADAPTERS];
}

/** Adaptér podle typu konektoru. */
export function getConnectorAdapter(
  type: ConnectorType,
): ConnectorAdapter | undefined {
  return ADAPTERS.find((a) => a.type === type);
}
