"use server";

import { randomUUID } from "node:crypto";
import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { logUserActivity } from "@/lib/audit";
import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import { polyGroup, proposalInvitees, proposalStateLog, proposals, users } from "@/lib/db/schema";
import { serializeGroupNameProposalMeta } from "@/lib/proposals/special-proposals";
import {
  DEFAULT_ONBOARDING_WELCOME_MESSAGE,
  auditLogVisibilityLevels,
  groupNameChangeModes,
  placesMapVisibilityLevels,
  powerManagementModes,
  sleepingNetworkVisibilityLevels,
  type PlacesMapVisibility,
  type PolyGroupSettings,
} from "@/types/poly-group";
import {
  LONG_TEXT_MAX,
  maxCharsMessage,
  requiredLimitedString,
} from "@/lib/validation/string-limits";

export type { PlacesMapVisibility };

export interface PolyGroupActionResult {
  ok: boolean;
  message: string;
}

const settingsSchema = z.object({
  name: requiredLimitedString("Poly group name", LONG_TEXT_MAX),
  allowGroupNameProposals: z.boolean(),
  groupNameChangeMode: z.enum(groupNameChangeModes),
  powerManagementMode: z.enum(powerManagementModes),
  eventPrivacyOpen: z.boolean(),
  eventPrivacyPrivate: z.boolean(),
  eventPrivacySuperPrivate: z.boolean(),
  adminCanSeePrivate: z.boolean(),
  adminCanSeeSuperPrivate: z.boolean(),
  adminCanSeeUninvolved: z.boolean(),
  auditLogVisibility: z.enum(auditLogVisibilityLevels),
  allowUserProvisioning: z.boolean(),
  hideSleepingArrangements: z.boolean(),
  sleepingNetworkVisibility: z.enum(sleepingNetworkVisibilityLevels),
  placesMapVisibility: z.enum(placesMapVisibilityLevels),
  logTailLength: z.number().int().min(0).max(1000),
  onboardingWelcomeMessage: z
    .string()
    .trim()
    .min(1, "Welcome message is required.")
    .max(LONG_TEXT_MAX, maxCharsMessage("Welcome message", LONG_TEXT_MAX)),
  proposedMaxDays: z.number().int().min(0).max(365),
  atRiskTtlDays: z.number().int().min(1).max(365),
  archiveGraceHours: z.number().int().min(0).max(8760),
  redraftDeadlineHours: z.number().int().min(1).max(168),
  sleepingPartnerProposalMaxDays: z.number().int().min(1).max(365),
});

function rowToSettings(row: typeof polyGroup.$inferSelect): PolyGroupSettings {
  return {
    name: row.name,
    allowGroupNameProposals: row.allowGroupNameProposals,
    groupNameChangeMode: row.groupNameChangeMode as PolyGroupSettings["groupNameChangeMode"],
    powerManagementMode: row.powerManagementMode as PolyGroupSettings["powerManagementMode"],
    eventPrivacyOpen: row.eventPrivacyOpen,
    eventPrivacyPrivate: row.eventPrivacyPrivate,
    eventPrivacySuperPrivate: row.eventPrivacySuperPrivate,
    adminCanSeePrivate: row.adminCanSeePrivate,
    adminCanSeeSuperPrivate: row.adminCanSeeSuperPrivate,
    adminCanSeeUninvolved: row.adminCanSeeUninvolved ?? true,
    auditLogVisibility: row.auditLogVisibility as PolyGroupSettings["auditLogVisibility"],
    allowUserProvisioning: row.allowUserProvisioning,
    hideSleepingArrangements: row.hideSleepingArrangements,
    sleepingNetworkVisibility:
      row.sleepingNetworkVisibility === "involved" ? "involved" : "everyone",
    placesMapVisibility:
      (row.placesMapVisibility as PolyGroupSettings["placesMapVisibility"]) ?? "all",
    logTailLength: row.logTailLength,
    onboardingWelcomeMessage:
      row.onboardingWelcomeMessage?.trim() || DEFAULT_ONBOARDING_WELCOME_MESSAGE,
    proposedMaxDays: row.proposedMaxDays ?? 0,
    atRiskTtlDays: row.atRiskTtlDays ?? 7,
    archiveGraceHours: row.archiveGraceHours ?? 24,
    redraftDeadlineHours: row.redraftDeadlineHours ?? 24,
    sleepingPartnerProposalMaxDays: row.sleepingPartnerProposalMaxDays ?? 5,
  };
}

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return null;
  }
  return session;
}

/**
 * Loads the poly group display name for app chrome (all signed-in users).
 */
export async function getPolyGroupDisplayNameAction(): Promise<string> {
  await ensureDbReady();
  const db = getDb();
  const [row] = await db
    .select({ name: polyGroup.name })
    .from(polyGroup)
    .where(eq(polyGroup.id, 1))
    .limit(1);
  return row?.name?.trim() || "PolyCal";
}

/**
 * Loads poly group settings for the Admin tab (PC-30).
 */
export async function getPolyGroupSettingsAction(): Promise<PolyGroupSettings | null> {
  const session = await requireAdmin();
  if (!session) return null;

  await ensureDbReady();
  const db = getDb();
  const [row] = await db.select().from(polyGroup).where(eq(polyGroup.id, 1)).limit(1);
  if (!row) return null;
  return rowToSettings(row);
}

export interface EventPrivacyAvailability {
  open: boolean;
  private: boolean;
  superPrivate: boolean;
}

/**
 * Returns which event privacy levels are enabled for new proposals (any signed-in user) (PC-134).
 */
export async function getEventPrivacyAvailabilityAction(): Promise<EventPrivacyAvailability> {
  const session = await auth();
  if (!session?.user) {
    return { open: true, private: false, superPrivate: false };
  }

  await ensureDbReady();
  const db = getDb();
  const [row] = await db
    .select({
      eventPrivacyOpen: polyGroup.eventPrivacyOpen,
      eventPrivacyPrivate: polyGroup.eventPrivacyPrivate,
      eventPrivacySuperPrivate: polyGroup.eventPrivacySuperPrivate,
    })
    .from(polyGroup)
    .where(eq(polyGroup.id, 1))
    .limit(1);

  return {
    open: row?.eventPrivacyOpen ?? true,
    private: row?.eventPrivacyPrivate ?? true,
    superPrivate: row?.eventPrivacySuperPrivate ?? true,
  };
}

/**
 * Persists poly group settings and applies power-management role overrides (PC-30).
 */
export async function updatePolyGroupSettingsAction(
  input: PolyGroupSettings,
): Promise<PolyGroupActionResult> {
  const session = await requireAdmin();
  if (!session) {
    return { ok: false, message: "Admin access required." };
  }

  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid settings." };
  }

  await ensureDbReady();
  const db = getDb();
  const [current] = await db.select().from(polyGroup).where(eq(polyGroup.id, 1)).limit(1);
  if (!current) {
    return { ok: false, message: "Poly group not initialized." };
  }

  const now = new Date().toISOString();
  let roleSnapshotsJson = current.roleSnapshotsJson;

  if (
    parsed.data.powerManagementMode === "all_admin" &&
    current.powerManagementMode !== "all_admin"
  ) {
    const allUsers = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.status, "active"));
    roleSnapshotsJson = JSON.stringify(
      Object.fromEntries(allUsers.map((u) => [u.id, u.role])),
    );
    for (const user of allUsers) {
      if (user.role !== "admin") {
        await db
          .update(users)
          .set({ role: "admin", updatedAt: now })
          .where(eq(users.id, user.id));
      }
    }
  }

  if (
    parsed.data.powerManagementMode === "admin_user" &&
    current.powerManagementMode === "all_admin" &&
    roleSnapshotsJson
  ) {
    try {
      const snapshots = JSON.parse(roleSnapshotsJson) as Record<string, string>;
      for (const [userId, role] of Object.entries(snapshots)) {
        await db
          .update(users)
          .set({
            role: role === "admin" ? "admin" : "user",
            updatedAt: now,
          })
          .where(eq(users.id, userId));
      }
    } catch {
      /* ignore corrupt snapshot */
    }
    roleSnapshotsJson = null;
  }

  await db
    .update(polyGroup)
    .set({
      name: parsed.data.name,
      allowGroupNameProposals: parsed.data.allowGroupNameProposals,
      groupNameChangeMode: parsed.data.groupNameChangeMode,
      powerManagementMode: parsed.data.powerManagementMode,
      roleSnapshotsJson,
      eventPrivacyOpen: parsed.data.eventPrivacyOpen,
      eventPrivacyPrivate: parsed.data.eventPrivacyPrivate,
      eventPrivacySuperPrivate: parsed.data.eventPrivacySuperPrivate,
      adminCanSeePrivate: parsed.data.adminCanSeePrivate,
      adminCanSeeSuperPrivate: parsed.data.adminCanSeeSuperPrivate,
      adminCanSeeUninvolved: parsed.data.adminCanSeeUninvolved,
      auditLogVisibility: parsed.data.auditLogVisibility,
      allowUserProvisioning: parsed.data.allowUserProvisioning,
      hideSleepingArrangements: parsed.data.hideSleepingArrangements,
      sleepingNetworkVisibility: parsed.data.sleepingNetworkVisibility,
      placesMapVisibility: parsed.data.placesMapVisibility,
      logTailLength: parsed.data.logTailLength,
      onboardingWelcomeMessage: parsed.data.onboardingWelcomeMessage,
      proposedMaxDays: parsed.data.proposedMaxDays,
      atRiskTtlDays: parsed.data.atRiskTtlDays,
      archiveGraceHours: parsed.data.archiveGraceHours,
      redraftDeadlineHours: parsed.data.redraftDeadlineHours,
      sleepingPartnerProposalMaxDays: parsed.data.sleepingPartnerProposalMaxDays,
      updatedAt: now,
    })
    .where(eq(polyGroup.id, 1));

  await logUserActivity(
    session.user.id,
    "admin.poly_group_settings_update",
    JSON.stringify({ name: parsed.data.name }),
    "system",
  );

  revalidatePath("/admin");
  revalidatePath("/people-places");
  revalidatePath("/feed");
  revalidatePath("/proposals");
  revalidatePath("/schedule");
  return { ok: true, message: "Poly group settings saved." };
}

const groupNameProposalSchema = z.object({
  proposedName: requiredLimitedString("Proposed name", LONG_TEXT_MAX),
});

/**
 * Creates a draft group name change proposal when enabled (PC-45/PC-60).
 */
export async function proposeGroupNameChangeAction(
  input: z.infer<typeof groupNameProposalSchema>,
): Promise<PolyGroupActionResult & { proposalId?: string }> {
  const session = await requireAdmin();
  if (!session) {
    return { ok: false, message: "Admin access required." };
  }

  const parsed = groupNameProposalSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid name." };
  }

  await ensureDbReady();
  const db = getDb();
  const [group] = await db.select().from(polyGroup).where(eq(polyGroup.id, 1)).limit(1);
  if (!group?.allowGroupNameProposals) {
    return { ok: false, message: "Group name proposals are disabled." };
  }

  if (group.groupNameChangeMode === "admin_only" && session.user.role !== "admin") {
    return { ok: false, message: "Only admins may propose group name changes in admin-only mode." };
  }

  if (parsed.data.proposedName === group.name) {
    return { ok: false, message: "Proposed name matches the current name." };
  }

  const inviteeFilter =
    group.groupNameChangeMode === "mandatory_consensus" ||
    group.groupNameChangeMode === "plurality"
      ? and(eq(users.status, "active"), ne(users.role, "passive"))
      : and(eq(users.status, "active"), ne(users.role, "passive"));

  const activeUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(inviteeFilter);

  const now = new Date().toISOString();
  const proposalId = `prop-${randomUUID()}`;
  const title = `Rename group to "${parsed.data.proposedName}"`;

  await db.insert(proposals).values({
    id: proposalId,
    title,
    description: serializeGroupNameProposalMeta({
      groupNameProposal: true,
      proposedName: parsed.data.proposedName,
      previousName: group.name,
    }),
    proposalType: "event",
    state: "draft",
    proposerId: session.user.id,
    eventPrivacy: "open",
    createdAt: now,
    updatedAt: now,
  });

  for (const user of activeUsers) {
    if (user.id === session.user.id) continue;
    await db.insert(proposalInvitees).values({
      id: `pi-${randomUUID()}`,
      proposalId,
      userId: user.id,
      role: "required",
      voteStatus: "not_seen",
      createdAt: now,
    });
  }

  await db.insert(proposalStateLog).values({
    id: `psl-${randomUUID()}`,
    proposalId,
    actorUserId: session.user.id,
    action: "draft.created",
    details: JSON.stringify({ kind: "group_name", proposedName: parsed.data.proposedName }),
    createdAt: now,
  });

  await logUserActivity(
    session.user.id,
    "admin.group_name_proposal",
    JSON.stringify({ proposalId, proposedName: parsed.data.proposedName, state: "draft" }),
    "system",
  );

  revalidatePath("/admin");
  revalidatePath("/proposals");
  return {
    ok: true,
    message: "Group name change saved as draft. Submit from Proposals when ready.",
    proposalId,
  };
}

/**
 * Returns Sleeping Partners tab visibility for People & Places (PC-73 / PC-180).
 */
export async function getPlacesMapVisibilityAction(): Promise<PlacesMapVisibility> {
  await ensureDbReady();
  const db = getDb();
  const [row] = await db
    .select({ placesMapVisibility: polyGroup.placesMapVisibility })
    .from(polyGroup)
    .where(eq(polyGroup.id, 1))
    .limit(1);
  return (row?.placesMapVisibility as PlacesMapVisibility) ?? "all";
}
