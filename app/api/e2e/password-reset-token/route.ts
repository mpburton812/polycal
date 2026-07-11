import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import { users } from "@/lib/db/schema";
import { isE2eApiAuthorized } from "@/lib/e2e-api";

/**
 * Seeds a password-reset token for E2E forgot/reset journeys (PC-162).
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (!isE2eApiAuthorized(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { username?: string; token?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const username = body.username?.trim().toLowerCase();
  const token = body.token?.trim();
  if (!username || !token) {
    return NextResponse.json({ error: "username and token required." }, { status: 400 });
  }

  await ensureDbReady();
  const db = getDb();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  await db
    .update(users)
    .set({
      passwordResetToken: token,
      passwordResetTokenExpiresAt: expiresAt,
      updatedAt: now,
    })
    .where(eq(users.username, username));

  return NextResponse.json({ ok: true });
}
