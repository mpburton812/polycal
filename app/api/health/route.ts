import { NextResponse } from "next/server";

import { SCHEMA_VERSION } from "@/lib/db/migrate";
import { ensureDbReady } from "@/lib/db/ensure-ready";

/**
 * Lightweight readiness probe for optional Vercel warmup crons (PC-144).
 * Runs ensureDbReady (short-circuits when schema is current) and returns OK.
 */
export async function GET() {
  try {
    await ensureDbReady();
    return NextResponse.json({
      ok: true,
      schemaVersion: SCHEMA_VERSION,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "health check failed";
    return NextResponse.json({ ok: false, error: message }, { status: 503 });
  }
}
