import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import { storedImages } from "@/lib/db/schema";

/**
 * Serves user-uploaded avatar blobs from `stored_images` (PC-45).
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await context.params;
  if (!id || id.length > 64) {
    return new NextResponse("Not found", { status: 404 });
  }

  await ensureDbReady();
  const db = getDb();
  const [row] = await db
    .select({ mimeType: storedImages.mimeType, data: storedImages.data })
    .from(storedImages)
    .where(eq(storedImages.id, id))
    .limit(1);

  if (!row?.data) {
    return new NextResponse("Not found", { status: 404 });
  }

  const bytes = row.data instanceof Buffer ? row.data : Buffer.from(row.data);
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": row.mimeType,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
