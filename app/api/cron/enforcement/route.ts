import { NextResponse } from "next/server";

import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import { runProposalEnforcement } from "@/lib/proposals/enforcement";

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
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  await ensureDbReady();
  const db = getDb();
  await runProposalEnforcement(db);

  return NextResponse.json({ ok: true, ranAt: new Date().toISOString() });
}
