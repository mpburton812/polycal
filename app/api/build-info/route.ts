import { NextResponse } from "next/server";

import { getBuildInfo } from "@/lib/env";

// Always reflect the currently-deployed server so the admin "Check for Update"
// control can compare against the build a stale tab was loaded with.
export const dynamic = "force-dynamic";

/**
 * Returns the running deployment's build descriptor (sha, branch, time, env).
 */
export async function GET() {
  return NextResponse.json(getBuildInfo(), {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
