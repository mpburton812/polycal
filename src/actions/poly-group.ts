"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { logUserActivity } from "@/lib/audit";
import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import { polyGroup, users } from "@/lib/db/schema";
import {
  DEFAULT_ONBOARDING_WELCOME_MESSAGE,
  auditLogVisibilityLevels,
  groupNameChangeModes,
  powerManagementModes,
  type PolyGroupSettings,
} from "@/types/poly-group";

export interface PolyGroupActionResult {
  ok: boolean;
  message: string;
}

const settingsSchema = z.object({
  name: z.string().trim().min(1).max(80),
  allowGroupNameProposals: z.boolean(),
  groupNameChangeMode: z.enum(groupNameChangeModes),
  powerManagementMode: z.enum(powerManagementModes),
  eventPrivacyOpen: z.boolean(),
  eventPrivacyPrivate: z.boolean(),
  eventPrivacySuperPrivate: z.boolean(),
  adminCanSeePrivate: z.boolean(),
  adminCanSeeSuperPrivate: z.boolean(),
  auditLogVisibility: z.enum(auditLogVisibilityLevels),
  allowUserProvisioning: z.boolean(),
  hideSleepingArrangements: z.boolean(),
  logTailLength: z.number().int().min(0).max(1000),
  onboardingWelcomeMessage: z.string().trim().min(1).max(2000),
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
    auditLogVisibility: row.auditLogVisibility as PolyGroupSettings["auditLogVisibility"],
    allowUserProvisioning: row.allowUserProvisioning,
    hideSleepingArrangements: row.hideSleepingArrangements,
    logTailLength: row.logTailLength,
    onboardingWelcomeMessage:
      row.onboardingWelcomeMessage?.trim() || DEFAULT_ONBOARDING_WELCOME_MESSAGE,
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
      auditLogVisibility: parsed.data.auditLogVisibility,
      allowUserProvisioning: parsed.data.allowUserProvisioning,
      hideSleepingArrangements: parsed.data.hideSleepingArrangements,
      logTailLength: parsed.data.logTailLength,
      onboardingWelcomeMessage: parsed.data.onboardingWelcomeMessage,
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
  return { ok: true, message: "Poly group settings saved." };
}
