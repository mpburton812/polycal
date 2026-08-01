/**
 * Starts Google Calendar OAuth (redirect). PC-339 / PC-348.
 * Query `return=onboarding` restores FirstLoginWizard Calendar step after connect.
 */
import { NextResponse } from "next/server";

import { beginGoogleCalendarConnectAction } from "@/actions/calendar";
import { getPublicAppUrl } from "@/lib/env";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const returnTo =
    url.searchParams.get("return") === "onboarding" ? "onboarding" : "profile";
  const result = await beginGoogleCalendarConnectAction({ returnTo });
  const base = getPublicAppUrl().replace(/\/$/, "");
  if (!result.ok) {
    const errorPath =
      returnTo === "onboarding"
        ? `/feed?onboardingStep=4&calendarError=${encodeURIComponent(result.message)}`
        : `/profile?calendarError=${encodeURIComponent(result.message)}`;
    return NextResponse.redirect(`${base}${errorPath}`);
  }
  return NextResponse.redirect(result.url);
}
