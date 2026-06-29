import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import { users } from "@/lib/db/schema";

/**
 * Sets notification_prefs_json for a user by username — E2E only (legacy migration journeys).
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (process.env.E2E_TEST_MODE !== "1") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { username?: string; notificationPrefsJson?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const username = body.username?.trim().toLowerCase();
  const notificationPrefsJson = body.notificationPrefsJson;
  if (!username || typeof notificationPrefsJson !== "string") {
    return NextResponse.json({ error: "username and notificationPrefsJson required." }, { status: 400 });
  }

  await ensureDbReady();
  const db = getDb();
  const now = new Date().toISOString();
  await db
    .update(users)
    .set({ notificationPrefsJson, updatedAt: now })
    .where(eq(users.username, username));

  return NextResponse.json({ ok: true });
}
