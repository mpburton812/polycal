/**
 * Starts Google Calendar OAuth (redirect). PC-339.
 */
import { NextResponse } from "next/server";

import { beginGoogleCalendarConnectAction } from "@/actions/calendar";
import { getPublicAppUrl } from "@/lib/env";

export async function GET() {
  const result = await beginGoogleCalendarConnectAction();
  if (!result.ok) {
    const base = getPublicAppUrl().replace(/\/$/, "");
    return NextResponse.redirect(
      `${base}/profile?calendarError=${encodeURIComponent(result.message)}`,
    );
  }
  return NextResponse.redirect(result.url);
}
