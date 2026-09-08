import { NextResponse } from "next/server";

/**
 * Telnyx inbound SMS webhook stub (PC-494).
 * STOP/HELP handling and signature verification land when SMS delivery is wired.
 * Always returns 200 so Telnyx retries do not pile up on an unfinished integration.
 */
export async function POST(request: Request) {
  try {
    await request.json().catch(() => null);
  } catch {
    // ignore malformed bodies
  }
  return NextResponse.json({ ok: true, received: true });
}

export async function GET() {
  return NextResponse.json({ ok: true, service: "telnyx-webhook" });
}
