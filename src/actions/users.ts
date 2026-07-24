"use server";

import { hash } from "bcryptjs";
import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, ne, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { logUserActivity } from "@/lib/audit";
import { requireAdminAccess, requireSession, withDb } from "@/lib/actions/context";
import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  calendarConnections,
  locationResidents,
  locations,
  polyGroup,
  proposalInvitees,
  proposalSlotVotes,
  proposals,
  sleepingPartnerships,
  users,
  type UserRole,
} from "@/lib/db/schema";
import { actorNotifyFields, notifyUser } from "@/lib/notifications";
import {
  dismissAllNotificationsForProposal,
  formatDraftReturnNotification,
} from "@/lib/notifications-draft-return";
import { enterPendingRecoveryIfNeeded } from "@/lib/proposals/pending-recovery";
import {
  deliverLoginCredentials,
  newEmailVerificationToken,
} from "@/lib/email/credentials";
import {
  buildLoginInstructions,
  generateTemporaryPassword,
} from "@/lib/users/credentials";
import { LONG_TEXT_MAX, maxCharsMessage } from "@/lib/validation/string-limits";

/** Shared username rules for provisioned active accounts. */
const usernameSchema = z
  .string()
  .trim()
  .min(2, "Username must be at least 2 characters.")
  .max(32, "Username must be 32 characters or fewer.")
  .regex(
    /^[a-z0-9._-]+$/i,
    "Username may only contain letters, numbers, and these characters: . _ -",
  );

const optionalNotificationEmailSchema = z
  .union([z.string().trim().email("Enter a valid email address."), z.literal("")])
  .optional()
  .transform((value) => (value && value.length > 0 ? value : undefined));

const activeUserSchema = z.object({
  username: usernameSchema,
  displayName: z
    .string()
    .trim()
    .min(1, "Display name is required.")
    .max(LONG_TEXT_MAX, maxCharsMessage("Display name", LONG_TEXT_MAX)),
  role: z.enum(["admin", "user"]),
  avatarKey: z.string().optional(),
  notificationEmail: optionalNotificationEmailSchema,
});

const passiveUserSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "Display name is required.")
    .max(LONG_TEXT_MAX, maxCharsMessage("Display name", LONG_TEXT_MAX)),
  avatarKey: z.string().optional(),
});

export interface PersonSummary {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  status: string;
  avatarKey: string | null;
  /** Optional bio shown under the name on People & Places (PC-117). */
  profileBio: string | null;
}

export interface AdminUserRow {
  id: string;
  displayName: string;
  username: string;
  gender: string | null;
  role: UserRole;
  status: string;
  lastLoginAt: string | null;
  loginCount: number;
}

export interface CreateUserResult {
  ok: boolean;
  message: string;
  loginInstructions?: string;
  temporaryPassword?: string;
  userId?: string;
  /** True when Resend accepted the credentials email. */
  emailed?: boolean;
}

export interface UserActionResult {
  ok: boolean;
  message: string;
}

/**
 * Returns whether the session may create users (admin or open provisioning).
 */
async function canProvisionUsers(): Promise<boolean> {
  const session = await auth();
  if (!session?.user) return false;
  if (session.user.role === "admin") return true;

  await ensureDbReady();
  const db = getDb();
  const [group] = await db.select().from(polyGroup).where(eq(polyGroup.id, 1)).limit(1);
  return Boolean(group?.allowUserProvisioning);
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);
}

/** Turns Zod issues into a single user-facing sentence. */
function formatZodError(error: z.ZodError): string {
  if (error.issues.length === 0) {
    return "One or more fields are invalid.";
  }

  return error.issues
    .map((issue) => {
      const field = issue.path.at(-1);
      const label =
        field === "username"
          ? "Username"
          : field === "displayName"
            ? "Display name"
            : field === "role"
              ? "Role"
              : field
                ? String(field)
                : "Input";
      return `${label}: ${issue.message}`;
    })
    .join(" ");
}

/**
 * Resolves optional lifecycle-action actor metadata before user rows can be changed (PC-299).
 */
async function lifecycleActorFields(
  db: ReturnType<typeof getDb>,
  actorUserId: string | null,
): Promise<ReturnType<typeof actorNotifyFields> | Record<string, never>> {
  if (!actorUserId) return {};
  const [actor] = await db
    .select({ displayName: users.displayName })
    .from(users)
    .where(eq(users.id, actorUserId))
    .limit(1);
  return actorNotifyFields({ id: actorUserId, displayName: actor?.displayName });
}

/**
 * Archives proposals owned by a departing user and removes them as invitees elsewhere (PC-45).
 */
async function archiveProposalsForDeletedUser(
  db: ReturnType<typeof getDb>,
  userId: string,
  actorUserId: string,
): Promise<void> {
  const now = new Date().toISOString();
  const actor = await lifecycleActorFields(db, actorUserId);

  const owned = await db
    .select({ id: proposals.id, title: proposals.title })
    .from(proposals)
    .where(
      and(
        eq(proposals.proposerId, userId),
        inArray(proposals.state, ["draft", "proposed", "resolved"]),
      ),
    );

  for (const proposal of owned) {
    await db
      .update(proposals)
      .set({
        state: "archived",
        scheduledStartAt: null,
        scheduledEndAt: null,
        atRisk: false,
        updatedAt: now,
      })
      .where(eq(proposals.id, proposal.id));

    const invitees = await db
      .select({ userId: proposalInvitees.userId })
      .from(proposalInvitees)
      .where(eq(proposalInvitees.proposalId, proposal.id));

    for (const invitee of invitees) {
      if (invitee.userId === userId) continue;
      await notifyUser(
        invitee.userId,
        "proposal_cancelled",
        `Proposal "${proposal.title}" was archived because the proposer was removed.`,
        { proposalId: proposal.id, ...actor },
      );
    }
  }

  await demoteOrRemoveInviteeFromActiveProposals(db, userId, actorUserId, "removed from the network");
}

/**
 * Removes places created by a departing user (PC-55).
 */
async function deletePlacesOwnedByUser(
  db: ReturnType<typeof getDb>,
  userId: string,
): Promise<void> {
  const ownedPlaces = await db
    .select({ id: locations.id })
    .from(locations)
    .where(eq(locations.createdById, userId));

  for (const place of ownedPlaces) {
    await db.delete(locationResidents).where(eq(locationResidents.locationId, place.id));
    await db
      .update(proposals)
      .set({ locationId: null, updatedAt: new Date().toISOString() })
      .where(eq(proposals.locationId, place.id));
    await db.delete(locations).where(eq(locations.id, place.id));
  }
}

/**
 * Demotes a paused/deleted user to optional on active proposals; reverts when no required remain (PC-45).
 */
async function demoteOrRemoveInviteeFromActiveProposals(
  db: ReturnType<typeof getDb>,
  userId: string,
  actorUserId: string | null,
  reason: string,
): Promise<void> {
  const now = new Date().toISOString();
  const actor = await lifecycleActorFields(db, actorUserId);

  const inviteeRows = await db
    .select({
      id: proposalInvitees.id,
      proposalId: proposalInvitees.proposalId,
      role: proposalInvitees.role,
    })
    .from(proposalInvitees)
    .innerJoin(proposals, eq(proposalInvitees.proposalId, proposals.id))
    .where(
      and(
        eq(proposalInvitees.userId, userId),
        inArray(proposals.state, ["proposed", "resolved"]),
      ),
    );

  for (const row of inviteeRows) {
    await db.delete(proposalSlotVotes).where(
      and(eq(proposalSlotVotes.proposalId, row.proposalId), eq(proposalSlotVotes.userId, userId)),
    );
    await db.delete(proposalInvitees).where(eq(proposalInvitees.id, row.id));

    const [proposal] = await db
      .select()
      .from(proposals)
      .where(eq(proposals.id, row.proposalId))
      .limit(1);
    if (!proposal) continue;

    const remainingRequired = await db
      .select({ userId: proposalInvitees.userId })
      .from(proposalInvitees)
      .where(
        and(eq(proposalInvitees.proposalId, row.proposalId), eq(proposalInvitees.role, "required")),
      );

    if (remainingRequired.length === 0) {
      await enterPendingRecoveryIfNeeded(db, row.proposalId, `participant ${reason}.`);
    } else if (row.role === "required") {
      const notifyIds = new Set<string>([
        proposal.proposerId,
        ...remainingRequired.map((r) => r.userId),
      ]);
      for (const notifyId of notifyIds) {
        await notifyUser(
          notifyId,
          "proposal_attendees_updated",
          `A required attendee was ${reason} on "${proposal.title}".`,
          { proposalId: row.proposalId, ...actor },
        );
      }
    }
  }
}

/**
 * Pauses active proposals involving a user by demoting them to optional (PC-45).
 */
async function pauseUserProposalSideEffects(
  db: ReturnType<typeof getDb>,
  userId: string,
  actorUserId: string | null,
): Promise<void> {
  const now = new Date().toISOString();
  const actor = await lifecycleActorFields(db, actorUserId);
  const affectedProposalIds = new Set<string>();

  const requiredRows = await db
    .select({ id: proposalInvitees.id, proposalId: proposalInvitees.proposalId })
    .from(proposalInvitees)
    .innerJoin(proposals, eq(proposalInvitees.proposalId, proposals.id))
    .where(
      and(
        eq(proposalInvitees.userId, userId),
        eq(proposalInvitees.role, "required"),
        inArray(proposals.state, ["proposed", "resolved"]),
      ),
    );

  for (const row of requiredRows) {
    await db
      .update(proposalInvitees)
      .set({ role: "optional", voteStatus: "abstain", respondedAt: now })
      .where(eq(proposalInvitees.id, row.id));
    affectedProposalIds.add(row.proposalId);
  }

  for (const proposalId of affectedProposalIds) {
    const remainingRequired = await db
      .select({ userId: proposalInvitees.userId })
      .from(proposalInvitees)
      .where(
        and(eq(proposalInvitees.proposalId, proposalId), eq(proposalInvitees.role, "required")),
      );

    if (remainingRequired.length > 0) continue;

    const [proposal] = await db
      .select()
      .from(proposals)
      .where(eq(proposals.id, proposalId))
      .limit(1);
    if (!proposal) continue;

    const noteLine = "Returned to drafts: no required invitees remain after a participant was paused.";
    await db
      .update(proposals)
      .set({
        state: "draft",
        atRisk: false,
        notes: proposal.notes?.trim() ? `${proposal.notes.trim()}\n${noteLine}` : noteLine,
        updatedAt: now,
      })
      .where(eq(proposals.id, proposalId));

    const invitees = await db
      .select({ userId: proposalInvitees.userId })
      .from(proposalInvitees)
      .where(eq(proposalInvitees.proposalId, proposalId));

    const notifyIds = new Set<string>([proposal.proposerId, ...invitees.map((i) => i.userId)]);
    await dismissAllNotificationsForProposal(proposalId);
    const message = formatDraftReturnNotification(
      proposal.title,
      "no required invitees remain after a participant was paused",
    );
    for (const notifyId of notifyIds) {
      await notifyUser(notifyId, "proposal_reverted_to_draft", message, {
        proposalId,
        reason: "participant paused",
        ...actor,
      });
    }
  }
}

/**
 * Lists active and passive users for the People tab (PC-35/36).
 */
export async function listPeopleAction(): Promise<PersonSummary[]> {
  await ensureDbReady();
  const db = getDb();
  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      role: users.role,
      status: users.status,
      avatarKey: users.avatarKey,
      profileBio: users.profileBio,
    })
    .from(users)
    .where(eq(users.status, "active"))
    .orderBy(asc(users.displayName));

  return rows.map((row) => ({
    ...row,
    avatarKey: row.avatarKey ?? null,
    profileBio: row.profileBio?.trim() || null,
  }));
}

/**
 * Creates an active user with a temporary password and clipboard instructions (PC-35 / PC-155).
 * Non-admin provisioners may only create User-role accounts.
 */
export async function createActiveUserAction(
  input: z.infer<typeof activeUserSchema>,
): Promise<CreateUserResult> {
  if (!(await canProvisionUsers())) {
    return { ok: false, message: "You do not have permission to create users." };
  }

  const session = await auth();
  const parsed = activeUserSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: formatZodError(parsed.error) };
  }

  const callerIsAdmin = session?.user?.role === "admin";
  const role = callerIsAdmin ? parsed.data.role : "user";
  if (!callerIsAdmin && parsed.data.role === "admin") {
    return {
      ok: false,
      message: "Only administrators can create admin accounts.",
    };
  }

  await ensureDbReady();
  const db = getDb();
  const username = parsed.data.username.toLowerCase();
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);
  if (existing) {
    return { ok: false, message: "Username is already taken." };
  }

  const tempPassword = generateTemporaryPassword();
  const passwordHash = await hash(tempPassword, 12);
  const now = new Date().toISOString();
  const userId = `user-${randomUUID()}`;
  const notificationEmail = parsed.data.notificationEmail?.trim() || null;
  const verifyToken = notificationEmail ? newEmailVerificationToken() : null;
  const verifyExpires = notificationEmail
    ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    : null;

  await db.insert(users).values({
    id: userId,
    username,
    displayName: parsed.data.displayName,
    passwordHash,
    role,
    status: "active",
    mustChangePassword: true,
    avatarKey: parsed.data.avatarKey ?? "bird_blue",
    theme: "mint",
    loginCount: 0,
    onboardingComplete: false,
    notificationEmail,
    emailVerifiedAt: null,
    emailVerificationToken: verifyToken,
    emailVerificationTokenExpiresAt: verifyExpires,
    createdAt: now,
    updatedAt: now,
  });

  await logUserActivity(
    session?.user?.id ?? null,
    "users.create_active",
    JSON.stringify({ userId, username, role, emailedTo: Boolean(notificationEmail) }),
  );

  const delivery = await deliverLoginCredentials({
    actorUserId: session?.user?.id ?? null,
    targetUserId: userId,
    username,
    password: tempPassword,
    toEmail: notificationEmail,
    includeVerifyLink: Boolean(verifyToken),
    verifyToken,
  });

  revalidatePath("/people-places");
  revalidatePath("/admin");
  revalidatePath("/api/dev/users");

  return {
    ok: true,
    message: delivery.emailed
      ? `Created active user ${parsed.data.displayName}. Login emailed.`
      : `Created active user ${parsed.data.displayName}.`,
    userId,
    temporaryPassword: tempPassword,
    loginInstructions: delivery.loginInstructions,
    emailed: delivery.emailed,
  };
}

const updateProvisionedUsernameSchema = z.object({
  userId: z.string().min(1, "User id is required."),
  username: usernameSchema,
  temporaryPassword: z.string().min(8, "Temporary password is missing or too short."),
});

/**
 * Checks whether a username is available (PC-35).
 */
export async function checkUsernameAvailableAction(
  username: string,
  excludeUserId?: string,
): Promise<{ available: boolean; message: string }> {
  const parsed = usernameSchema.safeParse(username);
  if (!parsed.success) {
    return {
      available: false,
      message: formatZodError(parsed.error),
    };
  }

  const normalized = parsed.data.toLowerCase();
  if (!checkRateLimit(`username-check:${normalized}`, 30, 60_000)) {
    return { available: false, message: "Too many checks. Try again shortly." };
  }

  await ensureDbReady();
  const db = getDb();
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, normalized))
    .limit(1);

  if (existing && existing.id !== excludeUserId) {
    return { available: false, message: "Username is already in use." };
  }

  return { available: true, message: "Username is available." };
}

/**
 * Updates username for a freshly provisioned user and returns refreshed credentials (PC-35).
 */
export async function updateProvisionedUsernameAction(
  input: z.infer<typeof updateProvisionedUsernameSchema>,
): Promise<CreateUserResult> {
  if (!(await canProvisionUsers())) {
    return { ok: false, message: "You do not have permission to update users." };
  }

  const parsed = updateProvisionedUsernameSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: formatZodError(parsed.error) };
  }

  await ensureDbReady();
  const db = getDb();
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, parsed.data.userId))
    .limit(1);

  if (!user || user.role === "passive" || !user.mustChangePassword) {
    return { ok: false, message: "Only newly provisioned active users can be updated here." };
  }

  const username = parsed.data.username.toLowerCase();
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);
  if (existing && existing.id !== user.id) {
    return { ok: false, message: "Username is already in use." };
  }

  const now = new Date().toISOString();
  await db
    .update(users)
    .set({ username, updatedAt: now })
    .where(eq(users.id, user.id));

  revalidatePath("/people-places");
  revalidatePath("/admin");
  revalidatePath("/api/dev/users");

  return {
    ok: true,
    message: "Username updated.",
    userId: user.id,
    temporaryPassword: parsed.data.temporaryPassword,
    loginInstructions: buildLoginInstructions({
      username,
      password: parsed.data.temporaryPassword,
    }),
  };
}

/**
 * Creates a passive schedulable profile without login credentials (PC-35/36).
 */
export async function createPassiveUserAction(
  input: z.infer<typeof passiveUserSchema>,
): Promise<CreateUserResult> {
  if (!(await canProvisionUsers())) {
    return { ok: false, message: "You do not have permission to create users." };
  }

  const sessionResult = await requireSession();
  if (!sessionResult.ok) {
    return { ok: false, message: sessionResult.message };
  }

  const parsed = passiveUserSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: formatZodError(parsed.error) };
  }

  return withDb(async (db) => {
  const now = new Date().toISOString();
  const userId = `passive-${randomUUID()}`;
  const username = `passive-${slugify(parsed.data.displayName)}-${userId.slice(-6)}`;
  const passwordHash = await hash(randomUUID(), 12);

  await db.insert(users).values({
    id: userId,
    username,
    displayName: parsed.data.displayName,
    passwordHash,
    role: "passive",
    status: "active",
    mustChangePassword: false,
    avatarKey: parsed.data.avatarKey ?? "bird_green",
    theme: "mint",
    loginCount: 0,
    createdAt: now,
    updatedAt: now,
  });

  await logUserActivity(
    sessionResult.user.id,
    "users.create_passive",
    JSON.stringify({ userId, displayName: parsed.data.displayName }),
  );

  revalidatePath("/people-places");
  revalidatePath("/admin");

  return {
    ok: true,
    message: `Created proxy profile ${parsed.data.displayName}.`,
    userId,
  };
  });
}

const adminUpdateUserSchema = z.object({
  userId: z.string().min(1, "User id is required."),
  displayName: z
    .string()
    .trim()
    .min(1, "Display name is required.")
    .max(LONG_TEXT_MAX, maxCharsMessage("Display name", LONG_TEXT_MAX)),
  avatarKey: z.string().optional(),
  role: z.enum(["admin", "user"]).optional(),
  username: usernameSchema.optional(),
  gender: z.string().trim().max(40).optional().nullable(),
});

/**
 * Updates any network member (admin only, PC-35).
 */
export async function updateUserAction(
  input: z.infer<typeof adminUpdateUserSchema>,
): Promise<UserActionResult> {
  const adminResult = await requireAdminAccess();
  if (!adminResult.ok) {
    return { ok: false, message: adminResult.message };
  }

  const parsed = adminUpdateUserSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: formatZodError(parsed.error) };
  }

  await ensureDbReady();
  const db = getDb();
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, parsed.data.userId))
    .limit(1);

  if (!user || user.status !== "active") {
    return { ok: false, message: "User not found." };
  }

  const now = new Date().toISOString();
  const updates: {
    displayName: string;
    avatarKey?: string;
    role?: "admin" | "user";
    username?: string;
    gender?: string | null;
    updatedAt: string;
  } = {
    displayName: parsed.data.displayName,
    updatedAt: now,
  };

  if (parsed.data.avatarKey) {
    updates.avatarKey = parsed.data.avatarKey;
  }

  if (parsed.data.gender !== undefined) {
    updates.gender = parsed.data.gender?.trim() || null;
  }

  if (user.role !== "passive") {
    if (parsed.data.role) {
      updates.role = parsed.data.role;
    }
    if (parsed.data.username) {
      const username = parsed.data.username.toLowerCase();
      const availability = await checkUsernameAvailableAction(username, user.id);
      if (!availability.available) {
        return { ok: false, message: availability.message };
      }
      updates.username = username;
    }
  }

  await db.update(users).set(updates).where(eq(users.id, user.id));

  await logUserActivity(
    adminResult.user.id,
    "users.admin_update",
    JSON.stringify({ userId: user.id, updates }),
  );

  revalidatePath("/people-places");
  revalidatePath("/admin");
  revalidatePath("/api/dev/users");
  revalidatePath("/profile");

  return { ok: true, message: `Updated ${parsed.data.displayName}.` };
}

/**
 * Soft-deletes a user and removes their graph edges (admin only, PC-35).
 */
export async function deleteUserAction(userId: string): Promise<UserActionResult> {
  const adminResult = await requireAdminAccess();
  if (!adminResult.ok) {
    return { ok: false, message: adminResult.message };
  }

  if (userId === adminResult.user.id) {
    return { ok: false, message: "You cannot delete your own account." };
  }

  await ensureDbReady();
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || (user.status !== "active" && user.status !== "paused")) {
    return { ok: false, message: "User not found." };
  }

  await db
    .delete(sleepingPartnerships)
    .where(
      or(
        eq(sleepingPartnerships.userLowId, userId),
        eq(sleepingPartnerships.userHighId, userId),
        eq(sleepingPartnerships.proposedById, userId),
      ),
    );

  await db
    .delete(locationResidents)
    .where(
      or(
        eq(locationResidents.userId, userId),
        eq(locationResidents.proposedById, userId),
      ),
    );

  await deletePlacesOwnedByUser(db, userId);

  await archiveProposalsForDeletedUser(db, userId, adminResult.user.id);
  await demoteOrRemoveInviteeFromActiveProposals(db, userId, adminResult.user.id, "removed");

  const { purgeUserGoogleCalendarData } = await import("@/lib/calendar/purge-google");
  await purgeUserGoogleCalendarData(db, userId);
  await db.delete(calendarConnections).where(eq(calendarConnections.userId, userId));

  const now = new Date().toISOString();
  await db
    .update(users)
    .set({
      status: "deleted",
      displayName: "Former User",
      username: `deleted-${userId.slice(-8)}`,
      passwordHash: await hash(randomUUID(), 12),
      notificationEmail: null,
      emailVerifiedAt: null,
      sessionVersion: user.sessionVersion + 1,
      updatedAt: now,
    })
    .where(eq(users.id, userId));

  await logUserActivity(
    adminResult.user.id,
    "users.admin_delete",
    JSON.stringify({ userId, username: user.username }),
  );

  revalidatePath("/people-places");
  revalidatePath("/admin");
  revalidatePath("/api/dev/users");
  revalidatePath("/proposals");
  revalidatePath("/schedule");

  return { ok: true, message: `Deleted ${user.displayName}.` };
}

/**
 * Lists users for the admin management table (PC-31 / PC-157).
 * Soft-deleted ("Former User") rows are omitted from the management screen.
 */
export async function listAdminUsersAction(): Promise<AdminUserRow[]> {
  const adminResult = await requireAdminAccess();
  if (!adminResult.ok) return [];

  await ensureDbReady();
  const db = getDb();
  const rows = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      username: users.username,
      gender: users.gender,
      role: users.role,
      status: users.status,
      lastLoginAt: users.lastLoginAt,
      loginCount: users.loginCount,
    })
    .from(users)
    .where(ne(users.status, "deleted"))
    .orderBy(asc(users.displayName));

  return rows;
}

/**
 * Pauses a user account and invalidates active sessions (PC-31).
 */
export async function pauseUserAction(userId: string): Promise<UserActionResult> {
  const adminResult = await requireAdminAccess();
  if (!adminResult.ok) return { ok: false, message: adminResult.message };
  if (userId === adminResult.user.id) {
    return { ok: false, message: "You cannot pause your own account." };
  }

  await ensureDbReady();
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || user.status !== "active") {
    return { ok: false, message: "User not found or not active." };
  }

  await pauseUserProposalSideEffects(db, userId, adminResult.user.id);

  const now = new Date().toISOString();
  await db
    .update(users)
    .set({
      status: "paused",
      sessionVersion: user.sessionVersion + 1,
      updatedAt: now,
    })
    .where(eq(users.id, userId));

  await logUserActivity(adminResult.user.id, "users.admin_pause", JSON.stringify({ userId }));
  revalidatePath("/admin");
  revalidatePath("/people-places");
  revalidatePath("/proposals");
  revalidatePath("/schedule");
  return { ok: true, message: `Paused ${user.displayName}.` };
}

/**
 * Resumes a paused user account (PC-31).
 */
export async function resumeUserAction(userId: string): Promise<UserActionResult> {
  const adminResult = await requireAdminAccess();
  if (!adminResult.ok) return { ok: false, message: adminResult.message };

  await ensureDbReady();
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || user.status !== "paused") {
    return { ok: false, message: "User is not paused." };
  }

  const now = new Date().toISOString();
  await db
    .update(users)
    .set({ status: "active", updatedAt: now })
    .where(eq(users.id, userId));

  await logUserActivity(adminResult.user.id, "users.admin_resume", JSON.stringify({ userId }));
  revalidatePath("/admin");
  revalidatePath("/people-places");
  return { ok: true, message: `Resumed ${user.displayName}.` };
}

const adminResetPasswordSchema = z.object({
  userId: z.string().min(1),
});

/**
 * Resets an active user's password and returns clipboard instructions (PC-10).
 */
export async function adminResetPasswordAction(
  input: z.infer<typeof adminResetPasswordSchema>,
): Promise<CreateUserResult> {
  const adminResult = await requireAdminAccess();
  if (!adminResult.ok) return { ok: false, message: adminResult.message };

  const parsed = adminResetPasswordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid input." };

  await ensureDbReady();
  const db = getDb();
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, parsed.data.userId))
    .limit(1);

  if (!user || user.role === "passive" || user.status !== "active") {
    return { ok: false, message: "Active user not found." };
  }

  const tempPassword = generateTemporaryPassword();
  const passwordHash = await hash(tempPassword, 12);
  const now = new Date().toISOString();

  await db
    .update(users)
    .set({
      passwordHash,
      mustChangePassword: true,
      sessionVersion: user.sessionVersion + 1,
      updatedAt: now,
    })
    .where(eq(users.id, user.id));

  await logUserActivity(
    adminResult.user.id,
    "users.admin_reset_password",
    JSON.stringify({ userId: user.id }),
  );

  const canEmail = Boolean(user.notificationEmail && user.emailVerifiedAt);
  const delivery = await deliverLoginCredentials({
    actorUserId: adminResult.user.id,
    targetUserId: user.id,
    username: user.username,
    password: tempPassword,
    toEmail: canEmail ? user.notificationEmail : null,
  });

  revalidatePath("/admin");
  revalidatePath("/people-places");

  return {
    ok: true,
    message: delivery.emailed
      ? `Password reset for ${user.displayName}. Instructions emailed.`
      : `Password reset for ${user.displayName}. Copy instructions to share securely.`,
    userId: user.id,
    temporaryPassword: tempPassword,
    loginInstructions: delivery.loginInstructions,
    emailed: delivery.emailed,
  };
}

const activatePassiveSchema = z.object({
  userId: z.string().min(1),
  username: usernameSchema,
  role: z.enum(["admin", "user"]).default("user"),
  notificationEmail: optionalNotificationEmailSchema,
});

/**
 * Converts a passive profile into an active user with login credentials (PC-10 / PC-155 / PC-161).
 * Non-admin provisioners may only activate as User role.
 */
export async function activatePassiveUserAction(
  input: z.infer<typeof activatePassiveSchema>,
): Promise<CreateUserResult> {
  if (!(await canProvisionUsers())) {
    return { ok: false, message: "You do not have permission to activate users." };
  }

  const sessionResult = await requireSession();
  if (!sessionResult.ok) {
    return { ok: false, message: sessionResult.message };
  }

  const parsed = activatePassiveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: formatZodError(parsed.error) };
  }

  const callerIsAdmin = sessionResult.user.role === "admin";
  const role = callerIsAdmin ? parsed.data.role : "user";
  if (!callerIsAdmin && parsed.data.role === "admin") {
    return {
      ok: false,
      message: "Only administrators can activate users as admins.",
    };
  }

  return withDb(async (db) => {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, parsed.data.userId))
    .limit(1);

  if (!user || user.role !== "passive" || user.status !== "active") {
    return { ok: false, message: "Proxy profile not found." };
  }

  const username = parsed.data.username.toLowerCase();
  const availability = await checkUsernameAvailableAction(username);
  if (!availability.available) {
    return { ok: false, message: availability.message };
  }

  const tempPassword = generateTemporaryPassword();
  const passwordHash = await hash(tempPassword, 12);
  const now = new Date().toISOString();
  const notificationEmail =
    parsed.data.notificationEmail?.trim() || user.notificationEmail || null;
  const verifyToken = notificationEmail ? newEmailVerificationToken() : null;
  const verifyExpires = notificationEmail
    ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    : null;

  await db
    .update(users)
    .set({
      username,
      passwordHash,
      role,
      mustChangePassword: true,
      onboardingComplete: false,
      activatedFromPassiveAt: now,
      notificationEmail,
      emailVerifiedAt: null,
      emailVerificationToken: verifyToken,
      emailVerificationTokenExpiresAt: verifyExpires,
      updatedAt: now,
    })
    .where(eq(users.id, user.id));

  await logUserActivity(
    sessionResult.user.id,
    "users.activate_passive",
    JSON.stringify({ userId: user.id, username, emailedTo: Boolean(notificationEmail) }),
  );

  const delivery = await deliverLoginCredentials({
    actorUserId: sessionResult.user.id,
    targetUserId: user.id,
    username,
    password: tempPassword,
    toEmail: notificationEmail,
    includeVerifyLink: Boolean(verifyToken),
    verifyToken,
  });

  revalidatePath("/people-places");
  revalidatePath("/admin");
  revalidatePath("/api/dev/users");

  return {
    ok: true,
    message: delivery.emailed
      ? `Activated ${user.displayName} as an active user. Login emailed.`
      : `Activated ${user.displayName} as an active user.`,
    userId: user.id,
    temporaryPassword: tempPassword,
    loginInstructions: delivery.loginInstructions,
    emailed: delivery.emailed,
  };
  });
}

export async function getProvisioningPolicyAction(): Promise<{
  canProvision: boolean;
  isAdmin: boolean;
}> {
  const session = await auth();
  const isAdmin = session?.user?.role === "admin";
  return {
    canProvision: await canProvisionUsers(),
    isAdmin: Boolean(isAdmin),
  };
}
