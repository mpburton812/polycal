"use server";

import { and, desc, eq, like, notExists, sql } from "drizzle-orm";
import { revalidateNotificationShellPaths } from "@/lib/notifications-revalidate";

import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import {
  locationResidents,
  notificationDismissals,
  proposalInvitees,
  proposals,
  proposalStateLog,
  sleepingPartnerships,
  userActivityLog,
} from "@/lib/db/schema";
import {
  INBOX_EXCLUDED_NOTIFICATION_TYPES,
  isActionableProposalNotification,
  isAttendeeUpdateStillActionable,
  isPartnershipStillActionable,
  isProposalVoteStillActionable,
  isResidencyStillActionable,
  partnershipIdFromNotificationMetadata,
  proposalIdFromNotificationMetadata,
  residencyIdFromNotificationMetadata,
} from "@/lib/notifications-inbox";

export interface NotificationItem {
  id: number;
  type: string;
  message: string;
  createdAt: string;
  metadata: Record<string, unknown>;
}

/**
 * Upper bound for the targeted dismissal sweeps (PC-355). They only ever act on
 * rows referencing one proposal/partnership, so scanning the newest slice of the
 * activity log is enough — older rows are already dismissed or irrelevant.
 */
const DISMISSAL_SCAN_LIMIT = 200;

/**
 * Correlated NOT EXISTS against notification_dismissals.
 *
 * Replaces loading every dismissed log id into a `NOT IN (…)` list, which grew
 * without bound for long-lived accounts (PC-355).
 */
function notDismissedByUser(userId: string) {
  return notExists(
    getDb()
      .select({ dismissed: sql`1` })
      .from(notificationDismissals)
      .where(
        and(
          eq(notificationDismissals.userId, userId),
          eq(notificationDismissals.logId, userActivityLog.id),
        ),
      ),
  );
}

/** Shared inbox predicate: this user's undismissed system notifications. */
function undismissedNotificationFilter(userId: string) {
  return and(
    eq(userActivityLog.userId, userId),
    eq(userActivityLog.eventType, "system"),
    like(userActivityLog.action, "notification.%"),
    notDismissedByUser(userId),
  );
}

/**
 * Parses notification payload stored in user_activity_log.details (PC-40).
 */
function parseNotificationDetails(
  action: string,
  details: string | null,
): { type: string; message: string; metadata: Record<string, unknown> } {
  const type = action.startsWith("notification.")
    ? action.slice("notification.".length)
    : action;

  if (!details) {
    return { type, message: "", metadata: {} };
  }

  try {
    const parsed = JSON.parse(details) as Record<string, unknown>;
    const message = typeof parsed.message === "string" ? parsed.message : "";
    const { message: _message, ...metadata } = parsed;
    return { type, message, metadata };
  } catch {
    return { type, message: details, metadata: {} };
  }
}

/**
 * Returns unread system notifications for the signed-in user (PC-40).
 */
export async function getNotificationInboxAction(): Promise<{
  ok: boolean;
  count: number;
  items: NotificationItem[];
}> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, count: 0, items: [] };
  }

  await ensureDbReady();
  const db = getDb();
  const userId = session.user.id;

  const rows = await db
    .select()
    .from(userActivityLog)
    .where(undismissedNotificationFilter(userId))
    .orderBy(desc(userActivityLog.createdAt))
    .limit(50);

  const items: NotificationItem[] = rows
    .map((row) => {
      const parsed = parseNotificationDetails(row.action, row.details);
      return {
        id: row.id,
        type: parsed.type,
        message: parsed.message,
        createdAt: row.createdAt,
        metadata: parsed.metadata,
      };
    })
    .filter((item) => !INBOX_EXCLUDED_NOTIFICATION_TYPES.has(item.type));

  return { ok: true, count: items.length, items };
}

/**
 * Dismisses a single notification for the signed-in user (PC-40).
 */
export async function dismissNotificationAction(
  logId: number,
): Promise<{ ok: boolean; message: string }> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, message: "Sign in required." };
  }

  await ensureDbReady();
  const db = getDb();
  const userId = session.user.id;

  const [row] = await db
    .select({ id: userActivityLog.id })
    .from(userActivityLog)
    .where(
      and(
        eq(userActivityLog.id, logId),
        eq(userActivityLog.userId, userId),
        eq(userActivityLog.eventType, "system"),
        like(userActivityLog.action, "notification.%"),
      ),
    )
    .limit(1);

  if (!row) {
    return { ok: false, message: "Notification not found." };
  }

  const now = new Date().toISOString();
  await db
    .insert(notificationDismissals)
    .values({ userId, logId, dismissedAt: now })
    .onConflictDoNothing();

  revalidateNotificationShellPaths();
  return { ok: true, message: "Notification dismissed." };
}

/**
 * Dismisses all visible notifications for the signed-in user (PC-40).
 */
export async function clearAllNotificationsAction(): Promise<{
  ok: boolean;
  message: string;
}> {
  const inbox = await getNotificationInboxAction();
  if (!inbox.ok || inbox.items.length === 0) {
    return { ok: true, message: "No notifications to clear." };
  }

  const session = await auth();
  if (!session?.user) {
    return { ok: false, message: "Sign in required." };
  }

  await ensureDbReady();
  const db = getDb();
  const userId = session.user.id;
  const now = new Date().toISOString();

  for (const item of inbox.items) {
    await db
      .insert(notificationDismissals)
      .values({ userId, logId: item.id, dismissedAt: now })
      .onConflictDoNothing();
  }

  revalidateNotificationShellPaths();
  return { ok: true, message: "All notifications cleared." };
}

/**
 * Soft-dismisses actionable inbox rows for a proposal (vote / attendee-update).
 * Leaves informational notices (e.g. proposal_resolved) intact (PC-217).
 */
export async function dismissNotificationsForProposal(
  userId: string,
  proposalId: string,
): Promise<number> {
  await ensureDbReady();
  const db = getDb();

  // Scoped to rows whose payload mentions this proposal, newest first, and
  // capped — the old query walked every undismissed row ever written (PC-355).
  const rows = await db
    .select()
    .from(userActivityLog)
    .where(
      and(
        undismissedNotificationFilter(userId),
        like(userActivityLog.details, `%${proposalId}%`),
      ),
    )
    .orderBy(desc(userActivityLog.createdAt))
    .limit(DISMISSAL_SCAN_LIMIT);

  const now = new Date().toISOString();
  let cleared = 0;

  for (const row of rows) {
    const parsed = parseNotificationDetails(row.action, row.details);
    if (INBOX_EXCLUDED_NOTIFICATION_TYPES.has(parsed.type)) continue;
    if (proposalIdFromNotificationMetadata(parsed.metadata) !== proposalId) continue;
    if (!isActionableProposalNotification(parsed.type, parsed.metadata)) continue;

    await db
      .insert(notificationDismissals)
      .values({ userId, logId: row.id, dismissedAt: now })
      .onConflictDoNothing();
    cleared += 1;
  }

  if (cleared > 0) {
    revalidateNotificationShellPaths();
  }
  return cleared;
}

/**
 * Soft-dismisses partnership_proposed inbox rows for a partnership (PC-349).
 */
export async function dismissNotificationsForPartnership(
  userId: string,
  partnershipId: string,
): Promise<number> {
  await ensureDbReady();
  const db = getDb();

  const rows = await db
    .select()
    .from(userActivityLog)
    .where(
      and(
        undismissedNotificationFilter(userId),
        eq(userActivityLog.action, "notification.partnership_proposed"),
        like(userActivityLog.details, `%${partnershipId}%`),
      ),
    )
    .orderBy(desc(userActivityLog.createdAt))
    .limit(DISMISSAL_SCAN_LIMIT);

  const now = new Date().toISOString();
  let cleared = 0;

  for (const row of rows) {
    const parsed = parseNotificationDetails(row.action, row.details);
    if (INBOX_EXCLUDED_NOTIFICATION_TYPES.has(parsed.type)) continue;
    if (parsed.type !== "partnership_proposed") continue;
    if (partnershipIdFromNotificationMetadata(parsed.metadata) !== partnershipId) continue;

    await db
      .insert(notificationDismissals)
      .values({ userId, logId: row.id, dismissedAt: now })
      .onConflictDoNothing();
    cleared += 1;
  }

  if (cleared > 0) {
    revalidateNotificationShellPaths();
  }
  return cleared;
}

/**
 * Soft-dismisses actionable inbox rows that are no longer actionable (PC-349).
 * Called when the notification bell opens so stale Accept/Decline rows disappear.
 */
export async function reconcileInboxNotificationsAction(): Promise<{
  ok: boolean;
  cleared: number;
  count: number;
  items: NotificationItem[];
}> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, cleared: 0, count: 0, items: [] };
  }

  await ensureDbReady();
  const db = getDb();
  const userId = session.user.id;

  const inbox = await getNotificationInboxAction();
  if (!inbox.ok) {
    return { ok: false, cleared: 0, count: 0, items: [] };
  }

  const now = new Date().toISOString();
  let cleared = 0;

  for (const item of inbox.items) {
    let stale = false;

    if (item.type === "partnership_proposed") {
      const partnershipId = partnershipIdFromNotificationMetadata(item.metadata);
      if (!partnershipId) {
        stale = true;
      } else {
        const [row] = await db
          .select({ status: sleepingPartnerships.status })
          .from(sleepingPartnerships)
          .where(eq(sleepingPartnerships.id, partnershipId))
          .limit(1);
        stale = !isPartnershipStillActionable(row?.status);
      }
    } else if (item.type === "residency_proposed") {
      const residencyId = residencyIdFromNotificationMetadata(item.metadata);
      if (!residencyId) {
        stale = true;
      } else {
        const [row] = await db
          .select({ status: locationResidents.status })
          .from(locationResidents)
          .where(eq(locationResidents.id, residencyId))
          .limit(1);
        stale = !isResidencyStillActionable(row?.status);
      }
    } else if (item.type === "proposal_attendee_update") {
      const proposalId = proposalIdFromNotificationMetadata(item.metadata);
      if (!proposalId) {
        stale = true;
      } else {
        const [proposal] = await db
          .select({ state: proposals.state })
          .from(proposals)
          .where(eq(proposals.id, proposalId))
          .limit(1);
        const [invitee] = await db
          .select({ voteStatus: proposalInvitees.voteStatus })
          .from(proposalInvitees)
          .where(
            and(eq(proposalInvitees.proposalId, proposalId), eq(proposalInvitees.userId, userId)),
          )
          .limit(1);
        const [maintained] = await db
          .select({ id: proposalStateLog.id })
          .from(proposalStateLog)
          .where(
            and(
              eq(proposalStateLog.proposalId, proposalId),
              eq(proposalStateLog.actorUserId, userId),
              eq(proposalStateLog.action, "proposal.attendee_update_maintained"),
            ),
          )
          .limit(1);
        stale = !isAttendeeUpdateStillActionable({
          proposalState: proposal?.state,
          voteStatus: invitee?.voteStatus,
          maintainedAfterNotification: Boolean(maintained),
        });
      }
    } else if (isActionableProposalNotification(item.type, item.metadata)) {
      const proposalId = proposalIdFromNotificationMetadata(item.metadata);
      if (!proposalId) {
        stale = true;
      } else {
        const [proposal] = await db
          .select({ state: proposals.state, atRisk: proposals.atRisk })
          .from(proposals)
          .where(eq(proposals.id, proposalId))
          .limit(1);
        const [invitee] = await db
          .select({
            voteStatus: proposalInvitees.voteStatus,
            role: proposalInvitees.role,
          })
          .from(proposalInvitees)
          .where(
            and(eq(proposalInvitees.proposalId, proposalId), eq(proposalInvitees.userId, userId)),
          )
          .limit(1);
        stale = !isProposalVoteStillActionable({
          proposalState: proposal?.state,
          voteStatus: invitee?.voteStatus,
          atRisk: proposal?.atRisk,
          role: invitee?.role,
        });
      }
    }

    if (!stale) continue;

    await db
      .insert(notificationDismissals)
      .values({ userId, logId: item.id, dismissedAt: now })
      .onConflictDoNothing();
    cleared += 1;
  }

  if (cleared > 0) {
    revalidateNotificationShellPaths();
  }

  const refreshed = await getNotificationInboxAction();
  return {
    ok: refreshed.ok,
    cleared,
    count: refreshed.count,
    items: refreshed.items,
  };
}
