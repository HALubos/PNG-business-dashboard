import { encryptSecret, decryptSecret } from "../crypto";

// ─────────────────────────────────────────────────────────────
// Meta (Facebook) OAuth — helper pro konektor Meta Ads (Graph API). App ID/secret
// jsou v .env (META_APP_ID / META_APP_SECRET), zadává je ČLOVĚK. Tokeny se ukládají
// ŠIFROVANĚ (crypto.ts) do Connector.credentialsEnc — nikdy plaintext do DB.
//
// Meta NEMÁ refresh tokeny: krátkodobý token z code se vymění za DLOUHODOBÝ
// (~60 dní). Dlouhodobý token lze před expirací znovu „prodloužit" stejnou výměnou
// (`fb_exchange_token`) — to dělá adaptér best-effort při syncu, takže okno se
// posouvá a token nevyprší.
//
// State (OAuth roundtrip) šifrujeme AES-GCM klíčem konektorů → integrita i důvěrnost.
// ─────────────────────────────────────────────────────────────

const GRAPH_VERSION = "v21.0";
const DIALOG_ENDPOINT = `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`;
const TOKEN_ENDPOINT = `https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`;

/** Scope pro čtení reklamních dat (jen pro čtení). */
export const META_SCOPE = "ads_read";

/** Callback cesta Meta Ads konektoru (musí být v Meta App → Valid OAuth Redirect URIs). */
export const META_CALLBACK_PATH = "/api/connectors/meta-ads/callback";

export interface MetaOAuthConfig {
  appId: string;
  appSecret: string;
  redirectUri: string;
}

/**
 * Konfigurace OAuth z .env. Vrací null, když chybí app ID/secret (UI pak uživatele
 * upozorní). `redirectUri` se odvodí z NEXTAUTH_URL — musí být zaregistrované v
 * Meta App (Valid OAuth Redirect URIs).
 */
export function metaOAuthConfig(): MetaOAuthConfig | null {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) return null;
  const base = (process.env.NEXTAUTH_URL || "http://localhost:3000").replace(
    /\/$/,
    "",
  );
  return { appId, appSecret, redirectUri: `${base}${META_CALLBACK_PATH}` };
}

/** Zašifruje state (JSON) do URL-safe řetězce pro OAuth roundtrip. */
export function encodeMetaState(value: unknown): string {
  return encodeURIComponent(encryptSecret(JSON.stringify(value)));
}

/** Dešifruje state z callbacku zpět na typovaný objekt (hází při podvrhu). */
export function decodeMetaState<T>(raw: string): T {
  return JSON.parse(decryptSecret(decodeURIComponent(raw))) as T;
}

/** Sestaví Facebook consent URL. */
export function buildMetaAuthUrl(cfg: MetaOAuthConfig, state: string): string {
  const p = new URLSearchParams({
    client_id: cfg.appId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: META_SCOPE,
    state,
  });
  return `${DIALOG_ENDPOINT}?${p.toString()}`;
}

export interface MetaToken {
  access_token: string;
  token_type?: string;
  expires_in?: number; // sekundy do expirace (dlouhodobý ~5184000)
}

/** Vymění authorization code za KRÁTKODOBÝ access token. */
export async function exchangeCodeForToken(
  cfg: MetaOAuthConfig,
  code: string,
): Promise<MetaToken> {
  const p = new URLSearchParams({
    client_id: cfg.appId,
    client_secret: cfg.appSecret,
    redirect_uri: cfg.redirectUri,
    code,
  });
  const res = await fetch(`${TOKEN_ENDPOINT}?${p.toString()}`);
  if (!res.ok) {
    throw new Error(
      `Výměna Meta OAuth kódu selhala (${res.status}): ${(await res.text()).slice(0, 300)}`,
    );
  }
  return (await res.json()) as MetaToken;
}

/**
 * Vymění (krátkodobý NEBO platný dlouhodobý) token za čerstvý DLOUHODOBÝ token
 * (~60 dní). Voláním nad platným dlouhodobým tokenem se okno posune → token
 * nevyprší. Vrací nový token i `expires_in`.
 */
export async function exchangeForLongLivedToken(
  cfg: MetaOAuthConfig,
  token: string,
): Promise<MetaToken> {
  const p = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: cfg.appId,
    client_secret: cfg.appSecret,
    fb_exchange_token: token,
  });
  const res = await fetch(`${TOKEN_ENDPOINT}?${p.toString()}`);
  if (!res.ok) {
    throw new Error(
      `Prodloužení Meta tokenu selhalo (${res.status}): ${(await res.text()).slice(0, 300)}`,
    );
  }
  return (await res.json()) as MetaToken;
}
