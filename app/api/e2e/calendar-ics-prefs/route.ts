import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import { calendarConnections, users } from "@/lib/db/schema";
import { isE2eApiAuthorized } from "@/lib/e2e-api";

/**
 * Upserts iCal/Other calendar prefs for a user by username — E2E only (PC-345).
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (!isE2eApiAuthorized(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { username?: string; delivery?: "download" | "email" | "both" };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const username = body.username?.trim().toLowerCase();
  const delivery = body.delivery ?? "download";
  if (!username || !["download", "email", "both"].includes(delivery)) {
    return NextResponse.json(
      { error: "username and delivery (download|email|both) required." },
      { status: 400 },
    );
  }

  await ensureDbReady();
  const db = getDb();
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);
  if (!user) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const now = new Date().toISOString();
  const [existing] = await db
    .select({ id: calendarConnections.id })
    .from(calendarConnections)
    .where(eq(calendarConnections.userId, user.id))
    .limit(1);

  if (existing) {
    await db
      .update(calendarConnections)
      .set({
        provider: "ics",
        icsDelivery: delivery,
        googleRefreshTokenEnc: null,
        googleAccessTokenEnc: null,
        googleTokenExpiresAt: null,
        googleCalendarId: null,
        googleAccountEmail: null,
        status: "active",
        updatedAt: now,
      })
      .where(eq(calendarConnections.id, existing.id));
  } else {
    await db.insert(calendarConnections).values({
      id: randomUUID(),
      userId: user.id,
      provider: "ics",
      icsDelivery: delivery,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
  }

  return NextResponse.json({ ok: true, userId: user.id, delivery });
}
