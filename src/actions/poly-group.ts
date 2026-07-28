"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { logUserActivity } from "@/lib/audit";
import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import { networks, polyGroup } from "@/lib/db/schema";
import { requireNetworkAdmin, requireNetworkSession } from "@/lib/networks/context";
import { loadNetworkSettings } from "@/lib/networks/settings";
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
  seePartnersSleepingArrangements: z.boolean(),
  fastSleepEnabled: z.boolean(),
  feedEnabled: z.boolean(),
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

function rowToSettings(row: {
  name: string;
  adminCanSeeUninvolved: boolean | null;
  auditLogVisibility: string;
  allowUserProvisioning: boolean;
  hideSleepingArrangements: boolean;
  seePartnersSleepingArrangements: boolean | null;
  fastSleepEnabled: boolean | null;
  feedEnabled: boolean | null;
  placesMapVisibility: string | null;
  logTailLength: number;
  onboardingWelcomeMessage: string | null;
  proposedMaxDays: number | null;
  atRiskTtlDays: number | null;
  archiveGraceHours: number | null;
  redraftDeadlineHours: number | null;
  sleepingPartnerProposalMaxDays: number | null;
}): PolyGroupSettings {
  return {
    name: row.name,
    adminCanSeeUninvolved: row.adminCanSeeUninvolved ?? true,
    auditLogVisibility: row.auditLogVisibility as PolyGroupSettings["auditLogVisibility"],
    allowUserProvisioning: row.allowUserProvisioning,
    hideSleepingArrangements: row.hideSleepingArrangements,
    seePartnersSleepingArrangements: row.seePartnersSleepingArrangements ?? false,
    fastSleepEnabled: row.fastSleepEnabled ?? true,
    feedEnabled: row.feedEnabled ?? true,
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
    const { requireNetworkSession } = await import("@/lib/networks/context");
    const { networks } = await import("@/lib/db/schema");
    const networkSession = await requireNetworkSession();
    if (networkSession.ok) {
      const [net] = await db
        .select({ name: networks.name })
        .from(networks)
        .where(eq(networks.id, networkSession.user.activeNetworkId))
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
 * Loads network settings for the Admin tab (PC-30 / PC-364).
 */
export async function getPolyGroupSettingsAction(): Promise<PolyGroupSettings | null> {
  const adminResult = await requireNetworkAdmin();
  if (!adminResult.ok) return null;

  await ensureDbReady();
  const settings = await loadNetworkSettings(adminResult.user.activeNetworkId);
  if (!settings) return null;
  return {
    name: settings.name,
    adminCanSeeUninvolved: settings.adminCanSeeUninvolved,
    auditLogVisibility: settings.auditLogVisibility,
    allowUserProvisioning: settings.allowUserProvisioning,
    hideSleepingArrangements: settings.hideSleepingArrangements,
    seePartnersSleepingArrangements: settings.seePartnersSleepingArrangements,
    fastSleepEnabled: settings.fastSleepEnabled,
    feedEnabled: settings.feedEnabled,
    placesMapVisibility: settings.placesMapVisibility,
    logTailLength: settings.logTailLength,
    onboardingWelcomeMessage: settings.onboardingWelcomeMessage,
    proposedMaxDays: settings.proposedMaxDays,
    atRiskTtlDays: settings.atRiskTtlDays,
    archiveGraceHours: settings.archiveGraceHours,
    redraftDeadlineHours: settings.redraftDeadlineHours,
    sleepingPartnerProposalMaxDays: settings.sleepingPartnerProposalMaxDays,
  };
}

/**
 * Persists active-network settings (PC-30 / PC-364).
 */
export async function updatePolyGroupSettingsAction(
  input: PolyGroupSettings,
): Promise<PolyGroupActionResult> {
  const adminResult = await requireNetworkAdmin();
  if (!adminResult.ok) {
    return { ok: false, message: adminResult.message };
  }

  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid settings." };
  }

  await ensureDbReady();
  const db = getDb();
  const networkId = adminResult.user.activeNetworkId;
  const [current] = await db
    .select({ id: networks.id })
    .from(networks)
    .where(eq(networks.id, networkId))
    .limit(1);
  if (!current) {
    return { ok: false, message: "Network not found." };
  }

  const now = new Date().toISOString();

  await db
    .update(networks)
    .set({
      name: parsed.data.name,
      adminCanSeeUninvolved: parsed.data.adminCanSeeUninvolved,
      auditLogVisibility: parsed.data.auditLogVisibility,
      allowUserProvisioning: parsed.data.allowUserProvisioning,
      hideSleepingArrangements: parsed.data.hideSleepingArrangements,
      seePartnersSleepingArrangements: parsed.data.seePartnersSleepingArrangements,
      fastSleepEnabled: parsed.data.fastSleepEnabled,
      feedEnabled: parsed.data.feedEnabled,
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
    .where(eq(networks.id, networkId));

  // Legacy dual-write so poly_group-backed readers stay in sync (PC-366).
  await db
    .update(polyGroup)
    .set({
      name: parsed.data.name,
      adminCanSeeUninvolved: parsed.data.adminCanSeeUninvolved,
      auditLogVisibility: parsed.data.auditLogVisibility,
      allowUserProvisioning: parsed.data.allowUserProvisioning,
      hideSleepingArrangements: parsed.data.hideSleepingArrangements,
      seePartnersSleepingArrangements: parsed.data.seePartnersSleepingArrangements,
      fastSleepEnabled: parsed.data.fastSleepEnabled,
      feedEnabled: parsed.data.feedEnabled,
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
    JSON.stringify({ name: parsed.data.name, networkId }),
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
  const networkSession = await requireNetworkSession();
  if (!networkSession.ok) return "all";

  await ensureDbReady();
  const settings = await loadNetworkSettings(networkSession.user.activeNetworkId);
  return settings?.placesMapVisibility ?? "all";
}
