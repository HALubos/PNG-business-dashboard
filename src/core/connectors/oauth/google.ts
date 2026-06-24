import { encryptSecret, decryptSecret } from "../crypto";

// ─────────────────────────────────────────────────────────────
// Google OAuth (Authorization Code flow) — sdílený helper pro OAuth konektory
// nad Google API (zatím GA4; později Google Ads). Client ID/secret jsou v .env
// (GOOGLE_OAUTH_CLIENT_ID/SECRET), zadává je ČLOVĚK, ne automat. Tokeny se ukládají
// ŠIFROVANĚ (crypto.ts) do Connector.credentialsEnc — nikdy plaintext do DB.
//
// State (přenášený přes OAuth roundtrip) šifrujeme AES-GCM klíčem konektorů →
// dostáváme integritu i důvěrnost (projectId/propertyId nelze podvrhnout).
// ─────────────────────────────────────────────────────────────

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

/** Scope pro čtení GA4 (Analytics Data API) — jen pro čtení. */
export const GA4_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/**
 * Konfigurace OAuth z .env. Vrací null, když chybí client ID/secret (UI pak
 * uživatele upozorní, že GA4 OAuth není nakonfigurováno). `redirectUri` se odvodí
 * z NEXTAUTH_URL — TOTO URL musí být zaregistrované v Google Cloud konzoli.
 */
export function googleOAuthConfig(): GoogleOAuthConfig | null {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  const base = (process.env.NEXTAUTH_URL || "http://localhost:3000").replace(
    /\/$/,
    "",
  );
  return {
    clientId,
    clientSecret,
    redirectUri: `${base}/api/connectors/ga4/callback`,
  };
}

/** Zašifruje state (JSON) do URL-safe řetězce pro OAuth roundtrip. */
export function encodeState(value: unknown): string {
  return encodeURIComponent(encryptSecret(JSON.stringify(value)));
}

/** Dešifruje state z callbacku zpět na typovaný objekt (hází při podvrhu). */
export function decodeState<T>(raw: string): T {
  return JSON.parse(decryptSecret(decodeURIComponent(raw))) as T;
}

/** Sestaví Google consent URL. `access_type=offline` + `prompt=consent` → refresh token. */
export function buildGoogleAuthUrl(
  cfg: GoogleOAuthConfig,
  scope: string,
  state: string,
): string {
  const p = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_ENDPOINT}?${p.toString()}`;
}

export interface GoogleTokens {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
}

/** Vymění authorization code za tokeny (vč. refresh_token při prvním souhlasu). */
export async function exchangeCodeForTokens(
  cfg: GoogleOAuthConfig,
  code: string,
): Promise<GoogleTokens> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      code,
      redirect_uri: cfg.redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    throw new Error(
      `Výměna OAuth kódu selhala (${res.status}): ${(await res.text()).slice(0, 300)}`,
    );
  }
  return (await res.json()) as GoogleTokens;
}

/**
 * Vymění refresh_token za čerstvý access_token. Voláme při KAŽDÉM syncu — Google
 * refresh tokeny standardně nerotuje a získat access token je levné, takže se tím
 * vyhneme evidenci expirace. Vrací access_token.
 */
export async function refreshGoogleAccessToken(
  cfg: GoogleOAuthConfig,
  refreshToken: string,
): Promise<string> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    throw new Error(
      `Obnova OAuth tokenu selhala (${res.status}): ${(await res.text()).slice(0, 300)}. Odpojte a připojte GA4 znovu.`,
    );
  }
  const json = (await res.json()) as GoogleTokens;
  if (!json.access_token) throw new Error("Google nevrátil access_token.");
  return json.access_token;
}
