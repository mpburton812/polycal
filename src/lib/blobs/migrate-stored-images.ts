import { sql } from "drizzle-orm";

import { putObjectBytes } from "@/lib/blobs/object-store";
import { getDb } from "@/lib/db/client";
import { storedImages } from "@/lib/db/schema";

/**
 * Copies a small batch of legacy Turso BLOBs into object storage and clears
 * the BLOB once the copy is readable (PC-538). Safe to call from cron.
 */
export async function migrateStoredImagesBatch(limit = 20): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({
      id: storedImages.id,
      mimeType: storedImages.mimeType,
      data: storedImages.data,
    })
    .from(storedImages)
    .where(sql`${storedImages.storageKey} IS NULL AND length(${storedImages.data}) > 0`)
    .limit(limit);

  let moved = 0;
  for (const row of rows) {
    const bytes = Buffer.from(row.data);
    if (bytes.byteLength === 0) continue;
    const key = await putObjectBytes(`images/${row.id}`, bytes, row.mimeType);
    if (!key) continue;
    await db
      .update(storedImages)
      .set({ storageKey: key, data: Buffer.alloc(0) })
      .where(sql`${storedImages.id} = ${row.id} AND ${storedImages.storageKey} IS NULL`);
    moved += 1;
  }
  return moved;
}
