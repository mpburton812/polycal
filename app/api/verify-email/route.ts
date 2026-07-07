import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { logUserActivity } from "@/lib/audit";
import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import { users } from "@/lib/db/schema";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * Verifies a notification email address from the link sent on profile update (PC-43).
 * Tokens expire after 24 hours.
 */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) {
    return NextResponse.json({ ok: false, message: "Missing token." }, { status: 400 });
  }

  const clientIp =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";
  if (!checkRateLimit(`verify-email:${clientIp}`, 20, 60_000)) {
    return NextResponse.json({ ok: false, message: "Too many requests." }, { status: 429 });
  }
  await ensureDbReady();
  const db = getDb();
  const [row] = await db
    .select({
      id: users.id,
      emailVerificationToken: users.emailVerificationToken,
      emailVerificationTokenExpiresAt: users.emailVerificationTokenExpiresAt,
    })
    .from(users)
    .where(eq(users.emailVerificationToken, token))
    .limit(1);

  if (!row) {
    return NextResponse.json({ ok: false, message: "Invalid or expired token." }, { status: 404 });
  }

  if (row.emailVerificationTokenExpiresAt) {
    const expiresAt = new Date(row.emailVerificationTokenExpiresAt).getTime();
    if (Number.isNaN(expiresAt) || Date.now() > expiresAt) {
      return NextResponse.json({ ok: false, message: "Invalid or expired token." }, { status: 404 });
    }
  }

  const now = new Date().toISOString();
  await db
    .update(users)
    .set({
      emailVerifiedAt: now,
      emailVerificationToken: null,
      emailVerificationTokenExpiresAt: null,
      updatedAt: now,
    })
    .where(eq(users.id, row.id));

  await logUserActivity(row.id, "profile.notification_email_verified");

  return NextResponse.json({ ok: true, message: "Email verified." });
}
