/**
 * Downloads a pending ICS file for the signed-in user (PC-340).
 */
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import { calendarIcsPending } from "@/lib/db/schema";

export async function GET(
  _request: Request,
  context: { params: Promise<{ pendingId: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { pendingId } = await context.params;
  await ensureDbReady();
  const db = getDb();
  const [row] = await db
    .select()
    .from(calendarIcsPending)
    .where(
      and(
        eq(calendarIcsPending.id, pendingId),
        eq(calendarIcsPending.userId, session.user.id),
      ),
    )
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const now = new Date().toISOString();
  await db
    .update(calendarIcsPending)
    .set({ downloadedAt: now, updatedAt: now })
    .where(eq(calendarIcsPending.id, row.id));

  return new NextResponse(row.icsBody, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${row.filename.replace(/"/g, "")}"`,
      "Cache-Control": "no-store",
    },
  });
}
