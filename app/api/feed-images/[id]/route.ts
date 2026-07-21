import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import { storedImages } from "@/lib/db/schema";
import { canViewerAccessFeedImage } from "@/lib/feed/image-access";
import type { UserRole } from "@/types/user";

/**
 * Serves feed-attached image blobs only when the session can see the attachment (PC-282).
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { id } = await context.params;
  if (!id || id.length > 64) {
    return new NextResponse("Not found", { status: 404 });
  }

  await ensureDbReady();

  const allowed = await canViewerAccessFeedImage(
    session.user.id,
    session.user.role as UserRole,
    id,
  );
  if (!allowed) {
    return new NextResponse("Forbidden", { status: 403 });
  }

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
