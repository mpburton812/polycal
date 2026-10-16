import { putObjectBytes, readObjectBytes } from "@/lib/blobs/object-store";

/**
 * Chooses object storage when it is configured and keeps an empty BLOB so the
 * NOT NULL column stays valid. Falls back to storing the bytes in Turso when
 * the object store is unavailable (PC-538).
 */
export async function storedImageInsert(input: {
  id: string;
  mimeType: string;
  bytes: Buffer;
  createdAt: string;
}): Promise<{
  id: string;
  mimeType: string;
  data: Buffer;
  storageKey: string | null;
  createdAt: string;
}> {
  const key = `images/${input.id}`;
  const storedKey = await putObjectBytes(key, input.bytes, input.mimeType);
  return {
    id: input.id,
    mimeType: input.mimeType,
    data: storedKey ? Buffer.alloc(0) : input.bytes,
    storageKey: storedKey,
    createdAt: input.createdAt,
  };
}

/** Prefers the object store and falls back to a legacy Turso BLOB. */
export async function readStoredImageBytes(row: {
  data: Buffer | Uint8Array | null;
  storageKey: string | null;
}): Promise<Buffer | null> {
  if (row.storageKey) {
    const stored = await readObjectBytes(row.storageKey);
    if (stored && stored.byteLength > 0) return stored;
  }
  if (!row.data || row.data.byteLength === 0) return null;
  return Buffer.from(row.data);
}
