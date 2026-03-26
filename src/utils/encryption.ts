import crypto from "crypto";

/**
 * AES-256-GCM encryption/decryption for sensitive fields at rest (e.g. API keys).
 *
 * Key: 32 bytes derived from RECALL_ENCRYPTION_KEY env var (64-char hex string).
 * IV:  12 bytes (96 bits) — random per encryption call, prepended to output.
 * Format: "<iv_hex>:<authTag_hex>:<ciphertext_hex>"
 *
 * The key is validated on first use — the app will throw at startup if the env
 * var is missing or malformed, preventing silent failures at call time.
 */

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12; // GCM standard — do NOT use 16

let _key: Buffer | null = null;

function getKey(): Buffer {
  if (_key) return _key;

  const hex = process.env.RECALL_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      "RECALL_ENCRYPTION_KEY must be a 64-character hex string (32 bytes). " +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    );
  }

  _key = Buffer.from(hex, "hex");
  return _key;
}

/**
 * Encrypts a plaintext string. Returns "<iv>:<authTag>:<ciphertext>" (hex).
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [iv.toString("hex"), authTag.toString("hex"), encrypted.toString("hex")].join(":");
}

/**
 * Decrypts a value produced by `encrypt`. Throws if the ciphertext has been
 * tampered with (GCM authentication tag mismatch).
 */
export function decrypt(encryptedValue: string): string {
  const key = getKey();
  const parts = encryptedValue.split(":");

  if (parts.length !== 3) {
    throw new Error("Invalid encrypted value format — expected iv:authTag:ciphertext");
  }

  const [ivHex, authTagHex, ciphertextHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const ciphertext = Buffer.from(ciphertextHex, "hex");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}
