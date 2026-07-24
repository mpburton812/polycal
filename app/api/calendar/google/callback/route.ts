/**
 * Google Calendar OAuth callback — stores encrypted refresh token (PC-339).
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

function redirectProfile(query: string): NextResponse {
  const base = getPublicAppUrl().replace(/\/$/, "");
  return NextResponse.redirect(`${base}/profile?${query}`);
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return redirectProfile("calendarError=" + encodeURIComponent("Sign in required."));
  }

  if (session.user.isImpersonating) {
    return redirectProfile(
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

  if (oauthError) {
    return redirectProfile(
      "calendarError=" + encodeURIComponent(`Google denied access: ${oauthError}`),
    );
  }

  const jar = await cookies();
  const expected = jar.get(GOOGLE_OAUTH_STATE_COOKIE)?.value;
  jar.delete(GOOGLE_OAUTH_STATE_COOKIE);

  if (!code || !state || !expected || state !== expected) {
    return redirectProfile(
      "calendarError=" + encodeURIComponent("Invalid OAuth state. Try connecting again."),
    );
  }

  const [userId] = state.split(":");
  if (userId !== session.user.id) {
    return redirectProfile(
      "calendarError=" + encodeURIComponent("OAuth session mismatch."),
    );
  }

  if (!isCalendarEncryptionConfigured()) {
    return redirectProfile(
      "calendarError=" + encodeURIComponent("Encryption key not configured."),
    );
  }

  try {
    const tokens = await exchangeGoogleCode(code);
    if (!tokens.refresh_token) {
      return redirectProfile(
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

    return redirectProfile("calendarGoogle=1");
  } catch (err) {
    return redirectProfile(
      "calendarError=" +
        encodeURIComponent(err instanceof Error ? err.message : "Google connect failed."),
    );
  }
}
