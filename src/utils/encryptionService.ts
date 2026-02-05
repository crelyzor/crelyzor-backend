import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits
const ENCODING = "base64" as const;

/**
 * Encryption Service using AES-256-GCM
 *
 * Used for encrypting sensitive Zoom S2S OAuth credentials at rest.
 * Requires ENCRYPTION_KEY environment variable (32 bytes, base64 encoded).
 *
 * Format: base64(iv:authTag:ciphertext)
 */
class EncryptionService {
  private getKey(): Buffer {
    const keyBase64 = process.env.ENCRYPTION_KEY;
    if (!keyBase64) {
      throw new Error("ENCRYPTION_KEY environment variable is not set");
    }

    const key = Buffer.from(keyBase64, "base64");
    if (key.length !== 32) {
      throw new Error(
        `ENCRYPTION_KEY must be 32 bytes (256 bits). Got ${key.length} bytes.`,
      );
    }

    return key;
  }

  /**
   * Encrypt a plaintext string using AES-256-GCM
   *
   * @param plaintext - The text to encrypt
   * @returns Base64 encoded string containing iv:authTag:ciphertext
   */
  encrypt(plaintext: string): string {
    if (!plaintext) {
      throw new Error("Cannot encrypt empty or null value");
    }

    const key = this.getKey();
    const iv = crypto.randomBytes(IV_LENGTH);

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });

    const encrypted = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    // Combine iv + authTag + ciphertext and encode as base64
    const combined = Buffer.concat([iv, authTag, encrypted]);
    return combined.toString(ENCODING);
  }

  /**
   * Decrypt a ciphertext string using AES-256-GCM
   *
   * @param ciphertext - Base64 encoded string containing iv:authTag:ciphertext
   * @returns Decrypted plaintext string
   */
  decrypt(ciphertext: string): string {
    if (!ciphertext) {
      throw new Error("Cannot decrypt empty or null value");
    }

    const key = this.getKey();
    const combined = Buffer.from(ciphertext, ENCODING);

    // Extract components
    const iv = combined.subarray(0, IV_LENGTH);
    const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });

    decipher.setAuthTag(authTag);

    try {
      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
      ]);
      return decrypted.toString("utf8");
    } catch (error) {
      throw new Error("Decryption failed: invalid ciphertext or key");
    }
  }

  /**
   * Check if a value is encrypted (basic format check)
   *
   * @param value - The value to check
   * @returns True if the value appears to be encrypted
   */
  isEncrypted(value: string): boolean {
    if (!value) return false;

    try {
      const decoded = Buffer.from(value, ENCODING);
      // Minimum length: IV (12) + AuthTag (16) + at least 1 byte of ciphertext
      return decoded.length >= IV_LENGTH + AUTH_TAG_LENGTH + 1;
    } catch {
      return false;
    }
  }

  /**
   * Generate a new encryption key (for initial setup)
   *
   * @returns Base64 encoded 32-byte key suitable for ENCRYPTION_KEY env var
   */
  static generateKey(): string {
    return crypto.randomBytes(32).toString("base64");
  }
}

export const encryptionService = new EncryptionService();
