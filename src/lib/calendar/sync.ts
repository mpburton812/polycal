/**
 * One-way PolyCal → external calendar sync orchestrator (PC-338 / PC-342).
 * Non-blocking via Next.js `after()` so Vercel keeps the serverless invocation
 * alive until Google/ICS work finishes (bare `void` is dropped after the response).
 */
import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { after } from "next/server";

import { auth } from "@/lib/auth";
import { decryptSecret, encryptSecret } from "@/lib/calendar/crypto";
import {
  deleteGoogleEvent,
  insertGoogleEvent,
  patchGoogleEvent,
} from "@/lib/calendar/google-api";
import { refreshGoogleAccessToken } from "@/lib/calendar/google-oauth";
import { buildIcsDocument } from "@/lib/calendar/ics";
import { buildCalendarEventPayload, buildIcsUid } from "@/lib/calendar/payloads";
import type { CalendarSyncAction, IcsDeliveryMode } from "@/lib/calendar/types";
import { getDb } from "@/lib/db/client";
import {
  calendarConnections,
  calendarEventLinks,
  calendarIcsPending,
  proposalInvitees,
  proposals,
  users,
} from "@/lib/db/schema";
import { sendEmail } from "@/lib/email/send";
import { notifyUser } from "@/lib/notifications";
import { isNonScheduleProposal } from "@/lib/proposals/special-proposals";
import { logUserActivity } from "@/lib/audit";

type Db = ReturnType<typeof getDb>;

async function loadProposal(db: Db, proposalId: string) {
  const [row] = await db.select().from(proposals).where(eq(proposals.id, proposalId)).limit(1);
  return row ?? null;
}

/** Proposer + invitees who should receive calendar delivery. */
async function participantUserIds(db: Db, proposalId: string, proposerId: string): Promise<string[]> {
  const invitees = await db
    .select({ userId: proposalInvitees.userId })
    .from(proposalInvitees)
    .where(eq(proposalInvitees.proposalId, proposalId));
  return [...new Set([proposerId, ...invitees.map((r) => r.userId)])];
}

async function getValidGoogleAccessToken(
  db: Db,
  connection: typeof calendarConnections.$inferSelect,
): Promise<string | null> {
  if (!connection.googleRefreshTokenEnc) return null;
  const now = Date.now();
  const expiresAt = connection.googleTokenExpiresAt
    ? Date.parse(connection.googleTokenExpiresAt)
    : 0;

  if (
    connection.googleAccessTokenEnc &&
    Number.isFinite(expiresAt) &&
    expiresAt > now + 60_000
  ) {
    try {
      return decryptSecret(connection.googleAccessTokenEnc);
    } catch {
      // fall through to refresh
    }
  }

  try {
    const refreshToken = decryptSecret(connection.googleRefreshTokenEnc);
    const tokens = await refreshGoogleAccessToken(refreshToken);
    const updatedAt = new Date().toISOString();
    const expiresIso = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
    await db
      .update(calendarConnections)
      .set({
        googleAccessTokenEnc: encryptSecret(tokens.access_token),
        googleTokenExpiresAt: expiresIso,
        status: "active",
        updatedAt,
      })
      .where(eq(calendarConnections.id, connection.id));
    return tokens.access_token;
  } catch {
    await db
      .update(calendarConnections)
      .set({ status: "needs_reconnect", updatedAt: new Date().toISOString() })
      .where(eq(calendarConnections.id, connection.id));
    return null;
  }
}

async function syncGoogleForUser(
  db: Db,
  connection: typeof calendarConnections.$inferSelect,
  proposal: typeof proposals.$inferSelect,
  action: CalendarSyncAction,
): Promise<void> {
  if (!connection.googleCalendarId) {
    console.warn(
      "[calendar-sync] skip google: no calendar selected",
      proposal.id,
      connection.userId,
    );
    return;
  }
  const accessToken = await getValidGoogleAccessToken(db, connection);
  if (!accessToken) {
    console.warn(
      "[calendar-sync] skip google: no access token (needs reconnect?)",
      proposal.id,
      connection.userId,
    );
    return;
  }

  const [link] = await db
    .select()
    .from(calendarEventLinks)
    .where(
      and(
        eq(calendarEventLinks.userId, connection.userId),
        eq(calendarEventLinks.proposalId, proposal.id),
      ),
    )
    .limit(1);

  const now = new Date().toISOString();

  if (action === "delete") {
    if (link?.googleEventId && link.googleCalendarId) {
      await deleteGoogleEvent(accessToken, link.googleCalendarId, link.googleEventId);
    }
    if (link) {
      await db.delete(calendarEventLinks).where(eq(calendarEventLinks.id, link.id));
    }
    return;
  }

  const payload = buildCalendarEventPayload(proposal);
  if (!payload) {
    console.warn(
      "[calendar-sync] skip google: missing scheduledStartAt",
      proposal.id,
    );
    return;
  }

  const calendarId = connection.googleCalendarId;
  if (link?.googleEventId) {
    await patchGoogleEvent(accessToken, link.googleCalendarId ?? calendarId, link.googleEventId, payload);
    await db
      .update(calendarEventLinks)
      .set({
        googleCalendarId: calendarId,
        lastSyncedAt: now,
        updatedAt: now,
      })
      .where(eq(calendarEventLinks.id, link.id));
    return;
  }

  const eventId = await insertGoogleEvent(accessToken, calendarId, payload);
  if (link) {
    await db
      .update(calendarEventLinks)
      .set({
        provider: "google",
        googleEventId: eventId,
        googleCalendarId: calendarId,
        lastSyncedAt: now,
        updatedAt: now,
      })
      .where(eq(calendarEventLinks.id, link.id));
  } else {
    await db.insert(calendarEventLinks).values({
      id: randomUUID(),
      userId: connection.userId,
      proposalId: proposal.id,
      provider: "google",
      googleEventId: eventId,
      googleCalendarId: calendarId,
      icsUid: null,
      icsSequence: 0,
      lastSyncedAt: now,
      createdAt: now,
      updatedAt: now,
    });
  }
}

async function queueIcsPending(
  db: Db,
  input: {
    userId: string;
    proposalId: string;
    uid: string;
    sequence: number;
    method: "PUBLISH" | "REQUEST" | "CANCEL";
    filename: string;
    body: string;
    title: string;
  },
): Promise<string> {
  const now = new Date().toISOString();
  // Supersede prior undownloaded rows for same user/proposal.
  await db
    .update(calendarIcsPending)
    .set({ dismissedAt: now, updatedAt: now })
    .where(
      and(
        eq(calendarIcsPending.userId, input.userId),
        eq(calendarIcsPending.proposalId, input.proposalId),
        isNull(calendarIcsPending.dismissedAt),
        isNull(calendarIcsPending.downloadedAt),
      ),
    );

  const id = randomUUID();
  await db.insert(calendarIcsPending).values({
    id,
    userId: input.userId,
    proposalId: input.proposalId,
    icsUid: input.uid,
    icsSequence: input.sequence,
    method: input.method,
    filename: input.filename,
    icsBody: input.body,
    title: input.title,
    dismissedAt: null,
    downloadedAt: null,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

async function syncIcsForUser(
  db: Db,
  connection: typeof calendarConnections.$inferSelect,
  proposal: typeof proposals.$inferSelect,
  action: CalendarSyncAction,
): Promise<void> {
  const delivery = (connection.icsDelivery ?? "download") as IcsDeliveryMode;
  const [link] = await db
    .select()
    .from(calendarEventLinks)
    .where(
      and(
        eq(calendarEventLinks.userId, connection.userId),
        eq(calendarEventLinks.proposalId, proposal.id),
      ),
    )
    .limit(1);

  const now = new Date().toISOString();
  const uid = link?.icsUid ?? buildIcsUid(connection.userId, proposal.id);
  const nextSequence =
    action === "delete"
      ? (link?.icsSequence ?? 0) + 1
      : link
        ? link.icsSequence + 1
        : 0;

  const payload =
    action === "delete"
      ? {
          title: proposal.title,
          description: undefined,
          location: proposal.locationText,
          startAt: proposal.scheduledStartAt ?? now,
          endAt: proposal.scheduledEndAt,
          isAllDay: proposal.proposalType === "sleeping" || proposal.isAllDay,
          transparencyFree: proposal.proposalType === "sleeping",
          proposalType: proposal.proposalType,
        }
      : buildCalendarEventPayload(proposal);

  if (!payload) return;

  const method = action === "delete" ? "CANCEL" : delivery === "download" ? "PUBLISH" : "REQUEST";
  const doc = buildIcsDocument({
    userId: connection.userId,
    proposalId: proposal.id,
    payload,
    sequence: nextSequence,
    method,
    uid,
  });

  if (link) {
    await db
      .update(calendarEventLinks)
      .set({
        provider: "ics",
        icsUid: uid,
        icsSequence: nextSequence,
        lastSyncedAt: now,
        updatedAt: now,
      })
      .where(eq(calendarEventLinks.id, link.id));
  } else if (action !== "delete") {
    await db.insert(calendarEventLinks).values({
      id: randomUUID(),
      userId: connection.userId,
      proposalId: proposal.id,
      provider: "ics",
      googleEventId: null,
      googleCalendarId: null,
      icsUid: uid,
      icsSequence: nextSequence,
      lastSyncedAt: now,
      createdAt: now,
      updatedAt: now,
    });
  }

  const [userRow] = await db
    .select({
      notificationEmail: users.notificationEmail,
      emailVerifiedAt: users.emailVerifiedAt,
    })
    .from(users)
    .where(eq(users.id, connection.userId))
    .limit(1);

  const canEmail =
    Boolean(userRow?.notificationEmail && userRow.emailVerifiedAt) &&
    (delivery === "email" || delivery === "both");

  let emailed = false;
  if (canEmail && userRow?.notificationEmail) {
    try {
      const result = await sendEmail({
        to: userRow.notificationEmail,
        subject:
          action === "delete"
            ? `Cancelled: ${proposal.title}`
            : `Calendar: ${proposal.title}`,
        html: `<p>Your PolyCal event <strong>${escapeHtml(proposal.title)}</strong> ${
          action === "delete" ? "was cancelled" : "is ready to add to your calendar"
        }. An .ics file is attached.</p>`,
        text: `PolyCal calendar update for "${proposal.title}". See attached .ics.`,
        attachments: [
          {
            filename: doc.filename,
            content: Buffer.from(doc.body, "utf8").toString("base64"),
            contentType: "text/calendar; charset=utf-8",
          },
        ],
      });
      emailed = result.sent;
    } catch (err) {
      await logUserActivity(
        connection.userId,
        "calendar.ics_email_failed",
        JSON.stringify({
          proposalId: proposal.id,
          error: err instanceof Error ? err.message : "unknown",
        }),
        "system",
      );
    }
  }

  const needsPending =
    delivery === "download" || delivery === "both" || !emailed;

  if (needsPending) {
    const pendingId = await queueIcsPending(db, {
      userId: connection.userId,
      proposalId: proposal.id,
      uid: doc.uid,
      sequence: nextSequence,
      method,
      filename: doc.filename,
      body: doc.body,
      title: proposal.title,
    });
    await notifyUser(
      connection.userId,
      "calendar_ics_pending",
      action === "delete"
        ? `You have a calendar ics available for the cancelled event : ${proposal.title}.`
        : `You have a calendar ics available for the event : ${proposal.title}.`,
      {
        proposalId: proposal.id,
        pendingId,
        url: `/proposals?open=${encodeURIComponent(proposal.id)}`,
        proposalType: proposal.proposalType,
      },
    );
  }

  if (action === "delete" && link) {
    await db.delete(calendarEventLinks).where(eq(calendarEventLinks.id, link.id));
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * Syncs (or removes) external calendar events for all configured participants.
 * Safe to call fire-and-forget; logs failures without throwing to callers.
 * Pass `skipGoogle` when the triggering session is admin impersonation (PC-344).
 */
export async function syncProposalToExternalCalendars(
  proposalId: string,
  action: CalendarSyncAction,
  options?: { skipGoogle?: boolean },
): Promise<void> {
  try {
    const skipGoogle = options?.skipGoogle === true;
    if (skipGoogle) {
      console.info(
        "[calendar-sync] skip Google provider: impersonating session",
        proposalId,
        action,
      );
    }

    const db = getDb();
    const proposal = await loadProposal(db, proposalId);
    if (!proposal) {
      console.warn("[calendar-sync] skip: proposal not found", proposalId);
      return;
    }
    if (isNonScheduleProposal(proposal.description)) {
      console.info("[calendar-sync] skip: non-schedule proposal", proposalId);
      return;
    }

    // At-risk / recovery: keep existing events (no delete on soft state changes).
    // Delete only when explicitly cancelled/archived (action === "delete").

    const userIds = await participantUserIds(db, proposal.id, proposal.proposerId);
    if (userIds.length === 0) return;

    const connections = await db
      .select()
      .from(calendarConnections)
      .where(inArray(calendarConnections.userId, userIds));

    if (connections.length === 0) {
      console.info(
        "[calendar-sync] skip: no calendar connections for participants",
        proposalId,
        action,
        `userIds=${userIds.join(",")}`,
      );
      return;
    }

    console.info(
      "[calendar-sync] start",
      proposalId,
      action,
      connections.map((c) => `${c.provider}:${c.userId}`).join(","),
    );

    for (const connection of connections) {
      try {
        if (connection.provider === "google") {
          if (skipGoogle) continue;
          await syncGoogleForUser(db, connection, proposal, action);
        } else if (connection.provider === "ics") {
          await syncIcsForUser(db, connection, proposal, action);
        }
      } catch (err) {
        console.error(
          "[calendar-sync] provider failed",
          proposalId,
          connection.provider,
          err,
        );
        await logUserActivity(
          connection.userId,
          "calendar.sync_failed",
          JSON.stringify({
            proposalId,
            provider: connection.provider,
            action,
            error: err instanceof Error ? err.message : "unknown",
          }),
          "system",
        );
      }
    }

    console.info("[calendar-sync] done", proposalId, action);
  } catch (err) {
    console.error("[calendar-sync]", proposalId, action, err);
  }
}

/**
 * Schedules external calendar sync after the current response finishes.
 * Uses Next.js `after()` so Vercel `waitUntil` keeps the invocation alive.
 * In E2E (`E2E_TEST_MODE=1`), awaits sync so journeys can assert Download ICS immediately.
 * Captures impersonation from the current request before `after()` so Google
 * API calls stay disabled under admin impersonation (PC-344).
 */
export async function scheduleCalendarSync(
  proposalId: string,
  action: CalendarSyncAction,
): Promise<void> {
  const impersonationGate = auth()
    .then((session) => session?.user?.isImpersonating === true)
    .catch(() => false);

  if (process.env.E2E_TEST_MODE === "1") {
    const skipGoogle = await impersonationGate;
    await syncProposalToExternalCalendars(proposalId, action, { skipGoogle });
    return;
  }

  const run = async () => {
    const skipGoogle = await impersonationGate;
    await syncProposalToExternalCalendars(proposalId, action, { skipGoogle });
  };
  try {
    after(run);
  } catch {
    // No request context (unit tests / CLI): still perform the sync.
    void run();
  }
}
