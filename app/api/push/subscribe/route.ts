import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import { pushSubscriptions } from "@/lib/db/schema";

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

/**
 * Persists a browser Push subscription for the signed-in user (PC-43).
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ ok: false, message: "Sign in required." }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = subscribeSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: "Invalid subscription." }, { status: 400 });
  }

  await ensureDbReady();
  const db = getDb();
  const now = new Date().toISOString();
  const userId = session.user.id;

  const [existing] = await db
    .select({ id: pushSubscriptions.id, userId: pushSubscriptions.userId })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, parsed.data.endpoint))
    .limit(1);

  if (existing) {
    // Endpoints are unique per browser install. Re-pointing someone else's
    // endpoint at the caller would silently redirect their push notifications,
    // so a conflicting owner is rejected rather than reassigned (PC-353).
    if (existing.userId !== userId) {
      return NextResponse.json(
        { ok: false, message: "Subscription belongs to another account." },
        { status: 409 },
      );
    }
    await db
      .update(pushSubscriptions)
      .set({
        p256dh: parsed.data.keys.p256dh,
        auth: parsed.data.keys.auth,
        updatedAt: now,
      })
      .where(eq(pushSubscriptions.id, existing.id));
  } else {
    await db.insert(pushSubscriptions).values({
      id: `push-${randomUUID()}`,
      userId,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      createdAt: now,
      updatedAt: now,
    });
  }

  return NextResponse.json({ ok: true });
}
