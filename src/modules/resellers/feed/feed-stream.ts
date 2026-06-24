/** Escapuje regex-metaznaky v názvu tagu (např. `g:gtin`). */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Proudově stáhne feed a yielduje kompletní bloky `<itemTag …>…</itemTag>`, aniž by
 * držel celý soubor nebo stavěl DOM. V paměti je vždy jen jeden rozpracovaný blok.
 * Vhodné pro velké feedy (80+ MB).
 *
 * Otevírací tag se hledá jako `<itemTag` následované `>`, mezerou nebo `/` — pokrývá
 * `<item>` i `<order code="…">` (atributy), ale NE delší názvy jako `<orderItems>`
 * (lookahead `[\s/>]` to odliší). Pro tagy bez atributů jsou pozice shodné s dřívějším
 * `indexOf("<tag>")`, takže Google `<item>` / Heureka `<SHOPITEM>` / Interní `<entry>`
 * se chovají beze změny.
 */
export async function* streamFeedBlocks(
  url: string,
  itemTag: string,
): AsyncGenerator<string> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Feed vrátil HTTP ${res.status}.`);
  if (!res.body) throw new Error("Feed nevrátil tělo odpovědi.");

  const openRe = new RegExp(`<${escapeRe(itemTag)}(?=[\\s/>])`);
  const openHint = `<${itemTag}`; // pro retenci na hranici chunku
  const close = `</${itemTag}>`;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (value) buf += decoder.decode(value, { stream: true });

    for (;;) {
      const m = openRe.exec(buf);
      if (!m) {
        // Žádný otevírací tag (hlavička / mezera) — necháme jen konec kvůli
        // možnému rozseknutí tagu mezi chunky.
        if (buf.length > openHint.length) buf = buf.slice(-openHint.length);
        break;
      }
      const o = m.index;
      const c = buf.indexOf(close, o);
      if (c === -1) {
        // Neúplný blok — zahodíme vše před položkou a počkáme na další data.
        buf = buf.slice(o);
        break;
      }
      const end = c + close.length;
      yield buf.slice(o, end);
      buf = buf.slice(end);
    }

    if (done) break;
  }
}
