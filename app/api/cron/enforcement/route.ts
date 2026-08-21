import { NextResponse } from "next/server";

import { timingSafeEqualStrings } from "@/lib/crypto/timing-safe-equal";
import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import { runProposalEnforcement } from "@/lib/proposals/enforcement";
import { runEventReminders } from "@/lib/proposals/event-reminders";

/**
 * Scheduled enforcement runner for Render cron / external schedulers (PC-48).
 * Protect with `Authorization: Bearer <CRON_SECRET>`.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET not configured." }, { status: 503 });
  }

  const authHeader = request.headers.get("authorization");
  if (!timingSafeEqualStrings(authHeader, `Bearer ${secret}`)) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  await ensureDbReady();
  const db = getDb();
  await runProposalEnforcement(db);
  const remindersSent = await runEventReminders(db);
  const { expireStaleMotds } = await import("@/lib/motd/service");
  const motdsExpired = await expireStaleMotds(db);
  const { runPendingNetworkDeletes } = await import("@/lib/networks/pending-delete");
  const pendingDeletes = await runPendingNetworkDeletes();

  return NextResponse.json({
    ok: true,
    ranAt: new Date().toISOString(),
    remindersSent,
    motdsExpired,
    pendingDeletes,
  });
}
