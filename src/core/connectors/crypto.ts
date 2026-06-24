import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "crypto";

// ─────────────────────────────────────────────────────────────
// Šifrování tokenů/secretů konektorů AT-REST. Do DB (Connector.credentialsEnc)
// se NIKDY neukládá plaintext. Klíč je v .env (CONNECTOR_ENC_KEY); odvodí se z
// něj 32B klíč přes SHA-256. Algoritmus AES-256-GCM (autentizované šifrování).
//
// Formát payloadu: base64(iv).base64(authTag).base64(ciphertext)
// ─────────────────────────────────────────────────────────────

const ALGO = "aes-256-gcm";
const IV_BYTES = 12;

function key(): Buffer {
  const raw = process.env.CONNECTOR_ENC_KEY;
  if (!raw) {
    throw new Error(
      "Chybí CONNECTOR_ENC_KEY v .env — nutné pro šifrování tokenů konektorů.",
    );
  }
  return createHash("sha256").update(raw).digest();
}

/** Zašifruje text → přenosný payload (base64 části oddělené tečkou). */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    tag.toString("base64"),
    enc.toString("base64"),
  ].join(".");
}

/** Dešifruje payload zpět na text. Hází při poškození/neplatném klíči. */
export function decryptSecret(payload: string): string {
  const parts = payload.split(".");
  if (parts.length !== 3) throw new Error("Neplatný formát šifrovaného secretu.");
  const [ivB64, tagB64, dataB64] = parts;
  const decipher = createDecipheriv(ALGO, key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]);
  return dec.toString("utf8");
}

/** Zašifruje libovolný JSON (tokeny/refresh) do payloadu. */
export function encryptJson(value: unknown): string {
  return encryptSecret(JSON.stringify(value));
}

/** Dešifruje payload zpět na typovaný JSON. */
export function decryptJson<T>(payload: string): T {
  return JSON.parse(decryptSecret(payload)) as T;
}
