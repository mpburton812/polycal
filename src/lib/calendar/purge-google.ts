/**
 * Purges Google Calendar connection data for a user (PC-344 follow-up).
 * Revokes the refresh token at Google when possible, then deletes local rows.
 */
import { eq } from "drizzle-orm";

import { decryptSecret } from "@/lib/calendar/crypto";
import { revokeGoogleOAuthToken } from "@/lib/calendar/google-revoke";
import { getDb } from "@/lib/db/client";
import { calendarConnections, calendarEventLinks } from "@/lib/db/schema";

type Db = ReturnType<typeof getDb>;

/**
 * Removes Google OAuth tokens / event link mappings for `userId`.
 * Does not delete events already written to the user's Google Calendar.
 */
export async function purgeUserGoogleCalendarData(db: Db, userId: string): Promise<void> {
  const [connection] = await db
    .select()
    .from(calendarConnections)
    .where(eq(calendarConnections.userId, userId))
    .limit(1);

  if (connection?.googleRefreshTokenEnc) {
    try {
      const refreshToken = decryptSecret(connection.googleRefreshTokenEnc);
      await revokeGoogleOAuthToken(refreshToken);
    } catch {
      // Token may already be invalid; still clear local state.
    }
  } else if (connection?.googleAccessTokenEnc) {
    try {
      const accessToken = decryptSecret(connection.googleAccessTokenEnc);
      await revokeGoogleOAuthToken(accessToken);
    } catch {
      // ignore
    }
  }

  await db.delete(calendarEventLinks).where(eq(calendarEventLinks.userId, userId));

  if (!connection) return;

  if (connection.provider === "google") {
    await db.delete(calendarConnections).where(eq(calendarConnections.id, connection.id));
    return;
  }

  // iCal connection that still held leftover Google fields — clear them only.
  await db
    .update(calendarConnections)
    .set({
      googleRefreshTokenEnc: null,
      googleAccessTokenEnc: null,
      googleTokenExpiresAt: null,
      googleCalendarId: null,
      googleAccountEmail: null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(calendarConnections.id, connection.id));
}
