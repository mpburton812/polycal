"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { logUserActivity } from "@/lib/audit";
import { requireAdminAccess } from "@/lib/actions/context";
import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import { polyGroup } from "@/lib/db/schema";
import {
  DEFAULT_ONBOARDING_WELCOME_MESSAGE,
  auditLogVisibilityLevels,
  placesMapVisibilityLevels,
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
  adminCanSeeUninvolved: z.boolean(),
  auditLogVisibility: z.enum(auditLogVisibilityLevels),
  allowUserProvisioning: z.boolean(),
  hideSleepingArrangements: z.boolean(),
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
    adminCanSeeUninvolved: row.adminCanSeeUninvolved ?? true,
    auditLogVisibility: row.auditLogVisibility as PolyGroupSettings["auditLogVisibility"],
    allowUserProvisioning: row.allowUserProvisioning,
    hideSleepingArrangements: row.hideSleepingArrangements,
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

/**
 * Loads the poly group display name for app chrome (all signed-in users).
 * Prefers the active network name when multi-network memberships exist (PC-357).
 */
export async function getPolyGroupDisplayNameAction(): Promise<string> {
  await ensureDbReady();
  const db = getDb();
  try {
    const { auth } = await import("@/lib/auth");
    const { networks } = await import("@/lib/db/schema");
    const session = await auth();
    if (session?.user?.activeNetworkId) {
      const [net] = await db
        .select({ name: networks.name })
        .from(networks)
        .where(eq(networks.id, session.user.activeNetworkId))
        .limit(1);
      if (net?.name?.trim()) return net.name.trim();
    }
  } catch {
    /* fall through to poly_group */
  }
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
  const adminResult = await requireAdminAccess();
  if (!adminResult.ok) return null;

  await ensureDbReady();
  const db = getDb();
  const [row] = await db.select().from(polyGroup).where(eq(polyGroup.id, 1)).limit(1);
  if (!row) return null;
  return rowToSettings(row);
}

/**
 * Persists poly group settings (PC-30). Power management and event privacy levels
 * were removed (PC-280) — every group is admin_user mode and every proposal is open.
 */
export async function updatePolyGroupSettingsAction(
  input: PolyGroupSettings,
): Promise<PolyGroupActionResult> {
  const adminResult = await requireAdminAccess();
  if (!adminResult.ok) {
    return { ok: false, message: adminResult.message };
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

  await db
    .update(polyGroup)
    .set({
      name: parsed.data.name,
      adminCanSeeUninvolved: parsed.data.adminCanSeeUninvolved,
      auditLogVisibility: parsed.data.auditLogVisibility,
      allowUserProvisioning: parsed.data.allowUserProvisioning,
      hideSleepingArrangements: parsed.data.hideSleepingArrangements,
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
    adminResult.user.id,
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
