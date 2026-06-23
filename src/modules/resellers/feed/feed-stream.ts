/**
 * Proudově stáhne feed a yielduje kompletní bloky `<itemTag>…</itemTag>`, aniž by
 * držel celý soubor nebo stavěl DOM. V paměti je vždy jen jeden rozpracovaný blok.
 * Vhodné pro velké feedy (80+ MB).
 *
 * Pozn.: otevírací tag se hledá přesně jako `<itemTag>` (bez atributů) — pokrývá
 * Google `<item>`, Heureka `<SHOPITEM>`, Interní `<entry>`. (Atributy na položce =
 * TODO.)
 */
export async function* streamFeedBlocks(
  url: string,
  itemTag: string,
): AsyncGenerator<string> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Feed vrátil HTTP ${res.status}.`);
  if (!res.body) throw new Error("Feed nevrátil tělo odpovědi.");

  const open = `<${itemTag}>`;
  const close = `</${itemTag}>`;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (value) buf += decoder.decode(value, { stream: true });

    for (;;) {
      const o = buf.indexOf(open);
      if (o === -1) {
        // Žádný otevírací tag (hlavička / mezera) — necháme jen konec kvůli
        // možnému rozseknutí tagu mezi chunky.
        if (buf.length > open.length) buf = buf.slice(-open.length);
        break;
      }
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
