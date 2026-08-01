import { NextResponse } from "next/server";

import { isE2eApiAuthorized } from "@/lib/e2e-api";
import { resetTestDatabase } from "@/lib/seed/reset-test-database";

/**
 * Resets the isolated E2E database — only enabled when E2E_TEST_MODE=1 (Playwright).
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (!isE2eApiAuthorized(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const result = await resetTestDatabase();
    const { seedE2eBurtonThompsonOverlay } = await import(
      "@/lib/seed/e2e-burton-thompson-overlay"
    );
    await seedE2eBurtonThompsonOverlay();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Reset failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
