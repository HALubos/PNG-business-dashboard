import {
  getFeedFormat,
  type FeedConfig,
  type NormalizedFeedItem,
} from "./formats";

export interface ParsedResellerFeed {
  items: NormalizedFeedItem[];
  warnings: string[];
}

/** Naparsuje feed odběratele zvoleným formátem a vrátí položky (dedup dle EANu). */
export function parseResellerFeed(
  xml: string,
  format: string | null,
  config: FeedConfig | null,
): ParsedResellerFeed {
  const fmt = getFeedFormat(format);
  const { items: raw, warnings } = fmt.normalize(xml, config);

  const seen = new Set<string>();
  const items = raw.filter((i) => {
    if (!i.ean || seen.has(i.ean)) return false;
    seen.add(i.ean);
    return true;
  });

  if (items.length === 0) warnings.push("Z feedu nebyl načten žádný EAN.");
  return { items, warnings };
}
