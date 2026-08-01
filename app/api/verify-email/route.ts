import { NextResponse } from "next/server";

import { checkRateLimitPersistent } from "@/lib/rate-limit";

/**
 * Legacy mail links hit this API — redirect to the branded landing page (PC-207).
 * Rate-limits before redirect so scrapers cannot spam the page.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  const clientIp =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";
  if (!(await checkRateLimitPersistent(`verify-email-api:${clientIp}`, 20, 60_000))) {
    const landing = new URL("/verify-email", url.origin);
    if (token) landing.searchParams.set("token", token);
    return NextResponse.redirect(landing, 302);
  }

  const landing = new URL("/verify-email", url.origin);
  if (token) {
    landing.searchParams.set("token", token);
  }
  return NextResponse.redirect(landing, 302);
}
