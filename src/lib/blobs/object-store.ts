import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { isNonProductionEnvironment } from "@/lib/env";

/**
 * Image bytes live outside Turso when a store is available (PC-538).
 * Local and e2e use a directory. Production uses Vercel Blob when
 * BLOB_READ_WRITE_TOKEN is set, and keeps the SQLite bytes otherwise so a
 * missing token does not drop uploads.
 */
export function objectStoreConfigured(): boolean {
  if (process.env.BLOB_READ_WRITE_TOKEN?.trim()) return true;
  return isNonProductionEnvironment();
}

function localRoot(): string {
  return process.env.OBJECT_STORE_DIR?.trim() || path.join(process.cwd(), ".data", "objects");
}

function localPath(key: string): string {
  const safe = key.replace(/[^a-zA-Z0-9._/-]/g, "");
  return path.join(localRoot(), safe);
}

/**
 * Writes bytes and returns the storage key. Null means the caller should keep
 * the bytes in SQLite.
 */
export async function putObjectBytes(
  key: string,
  bytes: Buffer,
  mimeType: string,
): Promise<string | null> {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (token) {
    const response = await fetch(
      `https://vercel.com/api/blob/?pathname=${encodeURIComponent(key)}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "x-api-version": "7",
          "x-content-type": mimeType,
          "x-vercel-blob-access": "private",
        },
        body: new Uint8Array(bytes),
      },
    );
    if (!response.ok) {
      console.error("[blobs] vercel put failed", response.status);
      return null;
    }
    return key;
  }

  if (!isNonProductionEnvironment()) return null;

  const filePath = localPath(key);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, bytes);
  return key;
}

/** Reads a previously stored object. Null when the key is missing. */
export async function readObjectBytes(key: string): Promise<Buffer | null> {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (token) {
    const response = await fetch(
      `https://vercel.com/api/blob/?pathname=${encodeURIComponent(key)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "x-api-version": "7",
        },
      },
    );
    if (!response.ok) return null;
    return Buffer.from(await response.arrayBuffer());
  }

  try {
    return await readFile(localPath(key));
  } catch {
    return null;
  }
}
