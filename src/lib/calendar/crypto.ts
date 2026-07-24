/**
 * Encrypts calendar OAuth secrets at rest (PC-338).
 * Uses AES-256-GCM with CALENDAR_TOKEN_ENCRYPTION_KEY (base64 or utf8, hashed to 32 bytes).
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const PREFIX = "v1:";

function encryptionKey(): Buffer {
  const raw = process.env.CALENDAR_TOKEN_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new Error("CALENDAR_TOKEN_ENCRYPTION_KEY is not configured");
  }
  // Accept base64 or arbitrary secret string; always derive a 32-byte key.
  let material: Buffer;
  try {
    material = Buffer.from(raw, "base64");
    if (material.length < 16) material = Buffer.from(raw, "utf8");
  } catch {
    material = Buffer.from(raw, "utf8");
  }
  return createHash("sha256").update(material).digest();
}

/** Returns true when an encryption key is present (Google connect can work). */
export function isCalendarEncryptionConfigured(): boolean {
  return Boolean(process.env.CALENDAR_TOKEN_ENCRYPTION_KEY?.trim());
}

/**
 * Encrypts a plaintext secret for DB storage.
 */
export function encryptSecret(plaintext: string): string {
  const key = encryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

/**
 * Decrypts a value produced by {@link encryptSecret}.
 */
export function decryptSecret(payload: string): string {
  if (!payload.startsWith(PREFIX)) {
    throw new Error("Unsupported calendar secret encoding");
  }
  const body = payload.slice(PREFIX.length);
  const [ivB64, tagB64, dataB64] = body.split(".");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Malformed calendar secret");
  }
  const key = encryptionKey();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
