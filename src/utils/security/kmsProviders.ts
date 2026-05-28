import crypto from "crypto";
import { env } from "../../config/environment";

export interface IKmsProvider {
  wrapKey(rawKey: Buffer): Promise<Buffer>;
  unwrapKey(wrappedKey: Buffer): Promise<Buffer>;
}

export class LocalKmsProvider implements IKmsProvider {
  private readonly masterKey: Buffer;

  constructor(localKmsKey: string) {
    const key = Buffer.from(localKmsKey, "hex");
    if (key.length !== 32) {
      throw new Error(
        "LOCAL_KMS_KEY must be a 32-byte hex string (64 hex chars). Generate: openssl rand -hex 32",
      );
    }
    this.masterKey = key;
  }

  async wrapKey(rawKey: Buffer): Promise<Buffer> {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", this.masterKey, iv);
    const ct = Buffer.concat([cipher.update(rawKey), cipher.final()]);
    const tag = cipher.getAuthTag();
    // Format: iv(12) | ciphertext | authTag(16)
    return Buffer.concat([iv, ct, tag]);
  }

  async unwrapKey(wrappedKey: Buffer): Promise<Buffer> {
    try {
      const iv = wrappedKey.subarray(0, 12);
      const tag = wrappedKey.subarray(wrappedKey.length - 16);
      const ct = wrappedKey.subarray(12, wrappedKey.length - 16);
      const decipher = crypto.createDecipheriv(
        "aes-256-gcm",
        this.masterKey,
        iv,
      );
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ct), decipher.final()]);
    } catch {
      throw new Error("Key operation failed");
    }
  }
}

export class GcpKmsProvider implements IKmsProvider {
  // Lazy singleton — avoid loading the GCP client in local dev
  private client:
    | import("@google-cloud/kms").KeyManagementServiceClient
    | null = null;
  private readonly keyName: string;

  constructor(keyName: string) {
    this.keyName = keyName;
  }

  private async getClient(): Promise<
    import("@google-cloud/kms").KeyManagementServiceClient
  > {
    if (!this.client) {
      const { KeyManagementServiceClient } = await import("@google-cloud/kms");
      this.client = new KeyManagementServiceClient();
    }
    return this.client;
  }

  async wrapKey(rawKey: Buffer): Promise<Buffer> {
    const client = await this.getClient();
    const [result] = await client.encrypt({
      name: this.keyName,
      plaintext: rawKey,
    });
    return Buffer.from(result.ciphertext as Uint8Array);
  }

  async unwrapKey(wrappedKey: Buffer): Promise<Buffer> {
    try {
      const client = await this.getClient();
      const [result] = await client.decrypt({
        name: this.keyName,
        ciphertext: wrappedKey,
      });
      return Buffer.from(result.plaintext as Uint8Array);
    } catch {
      throw new Error("Key operation failed");
    }
  }
}

// Lazy singleton — constructed on first call, not at module load
let _provider: IKmsProvider | null = null;

export function getKmsProvider(): IKmsProvider {
  if (_provider) return _provider;

  if (env.KMS_PROVIDER === "gcp") {
    if (!env.GCP_KMS_KEY_NAME) {
      throw new Error("GCP_KMS_KEY_NAME is required when KMS_PROVIDER=gcp");
    }
    _provider = new GcpKmsProvider(env.GCP_KMS_KEY_NAME);
  } else {
    if (!env.LOCAL_KMS_KEY) {
      throw new Error(
        "LOCAL_KMS_KEY is required when KMS_PROVIDER=local. Generate: openssl rand -hex 32",
      );
    }
    _provider = new LocalKmsProvider(env.LOCAL_KMS_KEY);
  }

  return _provider;
}

// Exported for testing — allows injecting a mock provider
export function _resetKmsProvider(): void {
  _provider = null;
}
