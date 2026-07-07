import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { canViewerAccessCustomAvatar } from "@/lib/avatars/access";
import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import { storedImages, users } from "@/lib/db/schema";
import type { UserRole } from "@/types/user";

/**
 * Serves user-uploaded avatar blobs from `stored_images` (PC-45).
 * Requires owner, sleeping partner, or admin access — avatars are not public assets.
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
  const db = getDb();

  const avatarKey = `custom:${id}`;
  const owners = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.avatarKey, avatarKey))
    .limit(1);

  const owner = owners[0];
  if (!owner) {
    return new NextResponse("Not found", { status: 404 });
  }

  const allowed = await canViewerAccessCustomAvatar(
    session.user.id,
    session.user.role as UserRole,
    owner.id,
  );
  if (!allowed) {
    return new NextResponse("Forbidden", { status: 403 });
  }

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
