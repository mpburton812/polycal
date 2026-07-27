/**
 * One-way PolyCal → external calendar sync orchestrator (PC-338 / PC-342 / PC-351).
 * Non-blocking via Next.js `after()` so Vercel keeps the serverless invocation
 * alive until Google/ICS work finishes (bare `void` is dropped after the response).
 */
import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { after } from "next/server";

import { mapWithConcurrency } from "@/lib/async/concurrency";
import { auth } from "@/lib/auth";
import { decryptSecret, encryptSecret } from "@/lib/calendar/crypto";
import {
  deleteGoogleEvent,
  insertGoogleEvent,
  patchGoogleEvent,
} from "@/lib/calendar/google-api";
import { refreshGoogleAccessToken } from "@/lib/calendar/google-oauth";
import { buildIcsMultiDocument } from "@/lib/calendar/ics";
import {
  buildCalendarEventPayloads,
  buildIcsUid,
  type CalendarEventPayload,
  type CalendarPayloadNameContext,
} from "@/lib/calendar/payloads";
import type { CalendarSyncAction, IcsDeliveryMode } from "@/lib/calendar/types";
import { getDb } from "@/lib/db/client";
import {
  calendarConnections,
  calendarEventLinks,
  calendarIcsPending,
  locations,
  proposalInvitees,
  proposals,
  users,
} from "@/lib/db/schema";
import { sendEmail } from "@/lib/email/send";
import { notifyUser } from "@/lib/notifications";
import { parseBatchEntriesJson } from "@/lib/proposals/batch-sleeping";
import { isNonScheduleProposal } from "@/lib/proposals/special-proposals";
import { logUserActivity } from "@/lib/audit";

type Db = ReturnType<typeof getDb>;

/**
 * Bounded fan-out for calendar work (PC-355). A batch sleeping proposal shared
 * by several participants used to issue every Google call strictly serially;
 * these caps keep the sweep quick without hammering Google's rate limits.
 */
const CALENDAR_SYNC_USER_CONCURRENCY = 3;
const CALENDAR_SYNC_NIGHT_CONCURRENCY = 4;

type ProposalRow = typeof proposals.$inferSelect;
type LinkRow = typeof calendarEventLinks.$inferSelect;
type ConnectionRow = typeof calendarConnections.$inferSelect;

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

/**
 * Loads display names for sleeping calendar titles (proposal + batch night invitees)
 * and place names for LOCATION resolution (PC-367).
 */
async function loadCalendarNameContext(
  db: Db,
  proposal: ProposalRow,
  inviteeIds: string[],
): Promise<CalendarPayloadNameContext> {
  const batchEntries = parseBatchEntriesJson(proposal.batchEntriesJson);
  const batchIds = batchEntries.flatMap((entry) =>
    entry.invitees.map((inv) => inv.userId),
  );
  const ids = [...new Set([proposal.proposerId, ...inviteeIds, ...batchIds])];

  const locationIds = [
    ...new Set(
      [
        proposal.locationId,
        ...batchEntries.map((entry) => entry.locationId),
      ].filter((id): id is string => Boolean(id?.trim())),
    ),
  ];

  const displayNameByUserId: Record<string, string> = {};
  if (ids.length > 0) {
    const rows = await db
      .select({ id: users.id, displayName: users.displayName })
      .from(users)
      .where(inArray(users.id, ids));
    for (const row of rows) {
      if (row.displayName?.trim()) {
        displayNameByUserId[row.id] = row.displayName.trim();
      }
    }
  }

  const placeNameByLocationId: Record<string, string> = {};
  if (locationIds.length > 0) {
    const placeRows = await db
      .select({ id: locations.id, name: locations.name })
      .from(locations)
      .where(inArray(locations.id, locationIds));
    for (const row of placeRows) {
      if (row.name?.trim()) {
        placeNameByLocationId[row.id] = row.name.trim();
      }
    }
  }

  const proposerName = displayNameByUserId[proposal.proposerId] ?? "Someone";
  const proposalInviteeNames = inviteeIds
    .map((id) => displayNameByUserId[id])
    .filter((name): name is string => Boolean(name?.trim()));

  return { proposerName, displayNameByUserId, proposalInviteeNames, placeNameByLocationId };
}

async function getValidGoogleAccessToken(
  db: Db,
  connection: ConnectionRow,
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

function batchNightNotifySuffix(proposal: ProposalRow, nightCount: number): string {
  if (!proposal.isBatchSleeping || nightCount <= 0) return "";
  const label = nightCount === 1 ? "1 all-day free night" : `${nightCount} all-day free nights`;
  return ` (${label})`;
}

/**
 * Notifies the connection owner about Google sync success (PC-346 / PC-351).
 */
async function notifyGoogleSynced(
  connection: ConnectionRow,
  proposal: ProposalRow,
  kind: "added" | "updated" | "removed",
  nightCount = 0,
): Promise<void> {
  const batchNote =
    kind !== "removed" ? batchNightNotifySuffix(proposal, nightCount) : "";
  const verb =
    kind === "added" ? "Added to" : kind === "updated" ? "Updated on" : "Removed from";
  await notifyUser(
    connection.userId,
    "calendar_google_synced",
    `${verb} Google Calendar: ${proposal.title}${batchNote}.`,
    {
      proposalId: proposal.id,
      url: `/proposals?open=${encodeURIComponent(proposal.id)}`,
      proposalType: proposal.proposalType,
      kind,
    },
  );
}

/** Actionable failure / incomplete-connect notifications (PC-346). */
async function notifyGoogleFailed(
  userId: string,
  proposal: ProposalRow,
  message: string,
): Promise<void> {
  await notifyUser(userId, "calendar_google_failed", message, {
    proposalId: proposal.id,
    url: "/profile",
    proposalType: proposal.proposalType,
  });
}

async function loadLinksForProposal(
  db: Db,
  userId: string,
  proposalId: string,
): Promise<LinkRow[]> {
  return db
    .select()
    .from(calendarEventLinks)
    .where(
      and(eq(calendarEventLinks.userId, userId), eq(calendarEventLinks.proposalId, proposalId)),
    );
}

function linkByNightKey(links: LinkRow[]): Map<string, LinkRow> {
  const map = new Map<string, LinkRow>();
  for (const link of links) {
    map.set(link.nightKey ?? "", link);
  }
  return map;
}

async function syncGoogleForUser(
  db: Db,
  connection: ConnectionRow,
  proposal: ProposalRow,
  action: CalendarSyncAction,
  nameCtx: CalendarPayloadNameContext,
): Promise<void> {
  if (!connection.googleCalendarId) {
    console.warn(
      "[calendar-sync] skip google: no calendar selected",
      proposal.id,
      connection.userId,
    );
    await notifyGoogleFailed(
      connection.userId,
      proposal,
      `Google Calendar connect is incomplete for "${proposal.title}" — pick a calendar in Profile.`,
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
    await notifyGoogleFailed(
      connection.userId,
      proposal,
      `Google Calendar needs reconnect before syncing "${proposal.title}". Open Profile to reconnect.`,
    );
    return;
  }

  const links = await loadLinksForProposal(db, connection.userId, proposal.id);
  const now = new Date().toISOString();
  const calendarId = connection.googleCalendarId;

  if (action === "delete") {
    for (const link of links) {
      if (link.googleEventId && link.googleCalendarId) {
        await deleteGoogleEvent(accessToken, link.googleCalendarId, link.googleEventId);
      }
      await db.delete(calendarEventLinks).where(eq(calendarEventLinks.id, link.id));
    }
    await notifyGoogleSynced(connection, proposal, "removed");
    return;
  }

  const payloads = buildCalendarEventPayloads(proposal, nameCtx, connection.userId);
  if (payloads.length === 0) {
    console.warn(
      "[calendar-sync] skip google: missing scheduledStartAt / empty batch nights",
      proposal.id,
    );
    return;
  }

  const existing = linkByNightKey(links);
  const desiredKeys = new Set(payloads.map((p) => p.nightKey));
  let created = 0;
  let updated = 0;

  // Nights are independent Google calls — run a few at a time (PC-355).
  await mapWithConcurrency(payloads, CALENDAR_SYNC_NIGHT_CONCURRENCY, async (payload) => {
    const link = existing.get(payload.nightKey);
    if (link?.googleEventId) {
      await patchGoogleEvent(
        accessToken,
        link.googleCalendarId ?? calendarId,
        link.googleEventId,
        payload,
      );
      await db
        .update(calendarEventLinks)
        .set({
          googleCalendarId: calendarId,
          nightKey: payload.nightKey,
          lastSyncedAt: now,
          updatedAt: now,
        })
        .where(eq(calendarEventLinks.id, link.id));
      updated += 1;
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
          nightKey: payload.nightKey,
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
        nightKey: payload.nightKey,
        lastSyncedAt: now,
        createdAt: now,
        updatedAt: now,
      });
    }
    created += 1;
  });

  // Reconcile: drop Google events for nights no longer in the payload set
  // (includes migrating legacy single-span night_key='' when batch expands).
  for (const link of links) {
    const key = link.nightKey ?? "";
    if (desiredKeys.has(key)) continue;
    if (link.googleEventId && link.googleCalendarId) {
      await deleteGoogleEvent(accessToken, link.googleCalendarId, link.googleEventId);
    }
    await db.delete(calendarEventLinks).where(eq(calendarEventLinks.id, link.id));
  }

  const kind = created > 0 && updated === 0 ? "added" : "updated";
  await notifyGoogleSynced(connection, proposal, kind, payloads.length);
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

function cancelPayloadFromLink(proposal: ProposalRow, link: LinkRow): CalendarEventPayload {
  return {
    title: proposal.title,
    description: undefined,
    location: proposal.locationText,
    startAt: proposal.scheduledStartAt ?? new Date().toISOString(),
    endAt: proposal.scheduledEndAt,
    isAllDay: proposal.proposalType === "sleeping" || proposal.isAllDay,
    transparencyFree: proposal.proposalType === "sleeping",
    proposalType: proposal.proposalType,
    nightKey: link.nightKey ?? "",
  };
}

async function syncIcsForUser(
  db: Db,
  connection: ConnectionRow,
  proposal: ProposalRow,
  action: CalendarSyncAction,
  nameCtx: CalendarPayloadNameContext,
): Promise<void> {
  const delivery = (connection.icsDelivery ?? "download") as IcsDeliveryMode;
  const links = await loadLinksForProposal(db, connection.userId, proposal.id);
  const existing = linkByNightKey(links);
  const now = new Date().toISOString();

  const method = action === "delete" ? "CANCEL" : delivery === "download" ? "PUBLISH" : "REQUEST";

  type EventSpec = {
    uid: string;
    sequence: number;
    payload: CalendarEventPayload;
    status?: "CONFIRMED" | "CANCELLED";
    nightKey: string;
    link?: LinkRow;
    removeAfter?: boolean;
  };

  const events: EventSpec[] = [];

  if (action === "delete") {
    for (const link of links) {
      const uid = link.icsUid ?? buildIcsUid(connection.userId, proposal.id, link.nightKey ?? "");
      const sequence = (link.icsSequence ?? 0) + 1;
      events.push({
        uid,
        sequence,
        payload: cancelPayloadFromLink(proposal, link),
        status: "CANCELLED",
        nightKey: link.nightKey ?? "",
        link,
        removeAfter: true,
      });
    }
    if (events.length === 0) return;
  } else {
    const payloads = buildCalendarEventPayloads(proposal, nameCtx, connection.userId);
    if (payloads.length === 0) return;

    const desiredKeys = new Set(payloads.map((p) => p.nightKey));

    for (const payload of payloads) {
      const link = existing.get(payload.nightKey);
      const uid =
        link?.icsUid ?? buildIcsUid(connection.userId, proposal.id, payload.nightKey);
      const sequence = link ? link.icsSequence + 1 : 0;
      events.push({
        uid,
        sequence,
        payload,
        nightKey: payload.nightKey,
        link,
      });
    }

    for (const link of links) {
      const key = link.nightKey ?? "";
      if (desiredKeys.has(key)) continue;
      const uid = link.icsUid ?? buildIcsUid(connection.userId, proposal.id, key);
      const sequence = (link.icsSequence ?? 0) + 1;
      events.push({
        uid,
        sequence,
        payload: cancelPayloadFromLink(proposal, link),
        status: "CANCELLED",
        nightKey: key,
        link,
        removeAfter: true,
      });
    }
  }

  const doc = buildIcsMultiDocument({
    method,
    events: events.map((e) => ({
      uid: e.uid,
      sequence: e.sequence,
      payload: e.payload,
      status: e.status,
    })),
    filenameTitle: proposal.title,
  });

  for (const event of events) {
    if (event.removeAfter) {
      if (event.link) {
        await db.delete(calendarEventLinks).where(eq(calendarEventLinks.id, event.link.id));
      }
      continue;
    }
    if (event.link) {
      await db
        .update(calendarEventLinks)
        .set({
          provider: "ics",
          icsUid: event.uid,
          icsSequence: event.sequence,
          nightKey: event.nightKey,
          lastSyncedAt: now,
          updatedAt: now,
        })
        .where(eq(calendarEventLinks.id, event.link.id));
    } else {
      await db.insert(calendarEventLinks).values({
        id: randomUUID(),
        userId: connection.userId,
        proposalId: proposal.id,
        provider: "ics",
        googleEventId: null,
        googleCalendarId: null,
        icsUid: event.uid,
        icsSequence: event.sequence,
        nightKey: event.nightKey,
        lastSyncedAt: now,
        createdAt: now,
        updatedAt: now,
      });
    }
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
    const maxSequence = Math.max(...events.map((e) => e.sequence), 0);
    const pendingId = await queueIcsPending(db, {
      userId: connection.userId,
      proposalId: proposal.id,
      uid: doc.primaryUid,
      sequence: maxSequence,
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

    const inviteeIds = userIds.filter((id) => id !== proposal.proposerId);
    const nameCtx = await loadCalendarNameContext(db, proposal, inviteeIds);

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
      // Proposer gets a recoverable nudge — production Fast-add miss was this skip (PC-347).
      if (action !== "delete") {
        await notifyUser(
          proposal.proposerId,
          "calendar_google_failed",
          `No calendar integration is connected for anyone on "${proposal.title}". Connect Google Calendar in Profile, then use Retry calendar sync on the proposal.`,
          {
            proposalId: proposal.id,
            url: "/profile",
            proposalType: proposal.proposalType,
            reason: "no_connections",
          },
        );
      }
      return;
    }

    console.info(
      "[calendar-sync] start",
      proposalId,
      action,
      connections.map((c) => `${c.provider}:${c.userId}`).join(","),
    );

    // Participants are independent; a slow or failing provider for one user must
    // not serialise the rest (PC-355). Errors stay contained per connection.
    await mapWithConcurrency(connections, CALENDAR_SYNC_USER_CONCURRENCY, async (connection) => {
      try {
        if (connection.provider === "google") {
          if (skipGoogle) return;
          await syncGoogleForUser(db, connection, proposal, action, nameCtx);
        } else if (connection.provider === "ics") {
          await syncIcsForUser(db, connection, proposal, action, nameCtx);
        }
      } catch (err) {
        console.error(
          "[calendar-sync] provider failed",
          proposalId,
          connection.provider,
          err,
        );
        const errorMessage = err instanceof Error ? err.message : "unknown";
        await logUserActivity(
          connection.userId,
          "calendar.sync_failed",
          JSON.stringify({
            proposalId,
            provider: connection.provider,
            action,
            error: errorMessage,
          }),
          "system",
        );
        if (connection.provider === "google") {
          await notifyGoogleFailed(
            connection.userId,
            proposal,
            `Could not sync "${proposal.title}" to Google Calendar. Try reconnecting in Profile, then use Retry calendar sync on the proposal.`,
          );
        }
      }
    });

    console.info("[calendar-sync] done", proposalId, action);
  } catch (err) {
    console.error("[calendar-sync]", proposalId, action, err);
  }
}

/**
 * Schedules external calendar sync after the current response finishes.
 * Uses Next.js `after()` so Vercel `waitUntil` keeps the invocation alive.
 * In E2E (`E2E_TEST_MODE=1`), awaits sync so journeys can assert Download ICS immediately.
 * Pass `awaitSync: true` for admin Fast sleeping (PC-347) so push does not rely solely
 * on post-response work.
 * Captures impersonation from the current request before `after()` so Google
 * API calls stay disabled under admin impersonation (PC-344).
 */
export async function scheduleCalendarSync(
  proposalId: string,
  action: CalendarSyncAction,
  options?: { awaitSync?: boolean },
): Promise<void> {
  const impersonationGate = auth()
    .then((session) => session?.user?.isImpersonating === true)
    .catch(() => false);

  if (process.env.E2E_TEST_MODE === "1" || options?.awaitSync === true) {
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
