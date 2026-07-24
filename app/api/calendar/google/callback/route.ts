/**
 * Google Calendar OAuth callback — stores encrypted refresh token (PC-339 / PC-348).
 */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { logUserActivity } from "@/lib/audit";
import { encryptSecret, isCalendarEncryptionConfigured } from "@/lib/calendar/crypto";
import {
  exchangeGoogleCode,
  fetchGoogleAccountEmail,
} from "@/lib/calendar/google-oauth";
import { GOOGLE_OAUTH_STATE_COOKIE } from "@/lib/calendar/types";
import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import { calendarConnections } from "@/lib/db/schema";
import { getPublicAppUrl } from "@/lib/env";

type OAuthReturnTo = "onboarding" | "profile";

function parseState(state: string): {
  userId: string;
  nonce: string;
  returnTo: OAuthReturnTo;
} | null {
  const parts = state.split(":");
  if (parts.length < 2) return null;
  const userId = parts[0];
  const nonce = parts[1];
  const returnTo = parts[2] === "onboarding" ? "onboarding" : "profile";
  if (!userId || !nonce) return null;
  return { userId, nonce, returnTo };
}

function redirectAfterOAuth(
  returnTo: OAuthReturnTo,
  query: string,
): NextResponse {
  const base = getPublicAppUrl().replace(/\/$/, "");
  if (returnTo === "onboarding") {
    // Incomplete onboarding still mounts FirstLoginWizard; restore Calendar step (PC-348).
    return NextResponse.redirect(`${base}/feed?onboardingStep=4&${query}`);
  }
  return NextResponse.redirect(`${base}/profile?${query}`);
}

export async function GET(request: Request) {
  const session = await auth();
  let returnTo: OAuthReturnTo = "profile";

  if (!session?.user) {
    return redirectAfterOAuth(
      returnTo,
      "calendarError=" + encodeURIComponent("Sign in required."),
    );
  }

  if (session.user.isImpersonating) {
    return redirectAfterOAuth(
      returnTo,
      "calendarError=" +
        encodeURIComponent(
          "Calendar integration changes and Google Calendar API calls are disabled while impersonating another user.",
        ),
    );
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  const jar = await cookies();
  const expected = jar.get(GOOGLE_OAUTH_STATE_COOKIE)?.value;
  jar.delete(GOOGLE_OAUTH_STATE_COOKIE);

  const parsedExpected = expected ? parseState(expected) : null;
  if (parsedExpected) {
    returnTo = parsedExpected.returnTo;
  }

  if (oauthError) {
    return redirectAfterOAuth(
      returnTo,
      "calendarError=" + encodeURIComponent(`Google denied access: ${oauthError}`),
    );
  }

  if (!code || !state || !expected || state !== expected) {
    return redirectAfterOAuth(
      returnTo,
      "calendarError=" + encodeURIComponent("Invalid OAuth state. Try connecting again."),
    );
  }

  const parsedState = parseState(state);
  if (!parsedState || parsedState.userId !== session.user.id) {
    return redirectAfterOAuth(
      returnTo,
      "calendarError=" + encodeURIComponent("OAuth session mismatch."),
    );
  }
  returnTo = parsedState.returnTo;

  if (!isCalendarEncryptionConfigured()) {
    return redirectAfterOAuth(
      returnTo,
      "calendarError=" + encodeURIComponent("Encryption key not configured."),
    );
  }

  try {
    const tokens = await exchangeGoogleCode(code);
    if (!tokens.refresh_token) {
      return redirectAfterOAuth(
        returnTo,
        "calendarError=" +
          encodeURIComponent(
            "Google did not return a refresh token. Remove PolyCal access in Google Account settings and try again.",
          ),
      );
    }

    const email = await fetchGoogleAccountEmail(tokens.access_token);
    await ensureDbReady();
    const db = getDb();
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    const [existing] = await db
      .select()
      .from(calendarConnections)
      .where(eq(calendarConnections.userId, session.user.id))
      .limit(1);

    const values = {
      provider: "google" as const,
      googleRefreshTokenEnc: encryptSecret(tokens.refresh_token),
      googleAccessTokenEnc: encryptSecret(tokens.access_token),
      googleTokenExpiresAt: expiresAt,
      googleAccountEmail: email,
      icsDelivery: null,
      status: "active" as const,
      updatedAt: now,
    };

    if (existing) {
      await db
        .update(calendarConnections)
        .set({
          ...values,
          // Keep prior calendar selection if reconnecting same account.
          googleCalendarId: existing.googleCalendarId,
        })
        .where(eq(calendarConnections.id, existing.id));
    } else {
      await db.insert(calendarConnections).values({
        id: randomUUID(),
        userId: session.user.id,
        googleCalendarId: null,
        createdAt: now,
        ...values,
      });
    }

    await logUserActivity(
      session.user.id,
      "calendar.google_connected",
      JSON.stringify({ email }),
    );

    return redirectAfterOAuth(returnTo, "calendarGoogle=1");
  } catch (err) {
    return redirectAfterOAuth(
      returnTo,
      "calendarError=" +
        encodeURIComponent(err instanceof Error ? err.message : "Google connect failed."),
    );
  }
}
