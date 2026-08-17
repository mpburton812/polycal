"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { logUserActivity } from "@/lib/audit";
import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import { networks } from "@/lib/db/schema";
import { requireNetworkAdmin, requireNetworkSession } from "@/lib/networks/context";
import { loadNetworkSettings, resolveNetworkSettings } from "@/lib/networks/settings";
import {
  auditLogVisibilityLevels,
  placesMapVisibilityLevels,
  proxySchedulingScopes,
  schedulingPostingModes,
  type AuditLogVisibility,
  type NetworkSettings,
  type PlacesMapVisibility,
  type ProxySchedulingScope,
  type SchedulingPostingMode,
} from "@/types/network-settings";
import {
  LONG_TEXT_MAX,
  maxCharsMessage,
  requiredLimitedString,
} from "@/lib/validation/string-limits";

export type { PlacesMapVisibility };

export interface NetworkSettingsActionResult {
  ok: boolean;
  message: string;
}

const settingsSchema = z.object({
  name: requiredLimitedString("Network name", LONG_TEXT_MAX),
  adminCanSeeUninvolved: z.boolean(),
  auditLogVisibility: z.enum(auditLogVisibilityLevels),
  allowUserProvisioning: z.boolean(),
  hideSleepingArrangements: z.boolean(),
  seePartnersSleepingArrangements: z.boolean(),
  fastSleepEnabled: z.boolean(),
  feedEnabled: z.boolean(),
  pollEnabled: z.boolean(),
  schedulingPosting: z.enum(schedulingPostingModes),
  proxySchedulingEnabled: z.boolean(),
  proxySchedulingScope: z.enum(proxySchedulingScopes),
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

function toNetworkSettings(row: {
  name: string;
  adminCanSeeUninvolved: boolean;
  auditLogVisibility: AuditLogVisibility;
  allowUserProvisioning: boolean;
  hideSleepingArrangements: boolean;
  seePartnersSleepingArrangements: boolean;
  fastSleepEnabled: boolean;
  feedEnabled: boolean;
  pollEnabled: boolean;
  schedulingPosting: SchedulingPostingMode;
  proxySchedulingEnabled: boolean;
  proxySchedulingScope: ProxySchedulingScope;
  placesMapVisibility: PlacesMapVisibility;
  logTailLength: number;
  onboardingWelcomeMessage: string;
  proposedMaxDays: number;
  atRiskTtlDays: number;
  archiveGraceHours: number;
  redraftDeadlineHours: number;
  sleepingPartnerProposalMaxDays: number;
}): NetworkSettings {
  return {
    name: row.name,
    adminCanSeeUninvolved: row.adminCanSeeUninvolved,
    auditLogVisibility: row.auditLogVisibility,
    allowUserProvisioning: row.allowUserProvisioning,
    hideSleepingArrangements: row.hideSleepingArrangements,
    seePartnersSleepingArrangements: row.seePartnersSleepingArrangements,
    fastSleepEnabled: row.fastSleepEnabled,
    feedEnabled: row.feedEnabled,
    pollEnabled: row.pollEnabled,
    schedulingPosting: row.schedulingPosting,
    proxySchedulingEnabled: row.proxySchedulingEnabled,
    proxySchedulingScope: row.proxySchedulingScope,
    placesMapVisibility: row.placesMapVisibility,
    logTailLength: row.logTailLength,
    onboardingWelcomeMessage: row.onboardingWelcomeMessage,
    proposedMaxDays: row.proposedMaxDays,
    atRiskTtlDays: row.atRiskTtlDays,
    archiveGraceHours: row.archiveGraceHours,
    redraftDeadlineHours: row.redraftDeadlineHours,
    sleepingPartnerProposalMaxDays: row.sleepingPartnerProposalMaxDays,
  };
}

/**
 * Loads the active network display name for app chrome (all signed-in users).
 */
export async function getNetworkDisplayNameAction(): Promise<string> {
  await ensureDbReady();
  const db = getDb();
  const networkSession = await requireNetworkSession();
  if (networkSession.ok) {
    const [net] = await db
      .select({ name: networks.name })
      .from(networks)
      .where(eq(networks.id, networkSession.user.activeNetworkId))
      .limit(1);
    if (net?.name?.trim()) return net.name.trim();
  }

  const fallback = await resolveNetworkSettings(db);
  return fallback?.name?.trim() || "PolyCal";
}

/**
 * Loads network settings for the Admin tab (PC-30 / PC-364).
 */
export async function getNetworkSettingsAction(): Promise<NetworkSettings | null> {
  const adminResult = await requireNetworkAdmin();
  if (!adminResult.ok) return null;

  await ensureDbReady();
  const settings = await loadNetworkSettings(adminResult.user.activeNetworkId);
  if (!settings) return null;
  return toNetworkSettings(settings);
}

/**
 * Persists active-network settings (PC-30 / PC-364).
 */
export async function updateNetworkSettingsAction(
  input: NetworkSettings,
): Promise<NetworkSettingsActionResult> {
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
      pollEnabled: parsed.data.pollEnabled,
      schedulingPosting: parsed.data.schedulingPosting,
      proxySchedulingEnabled: parsed.data.proxySchedulingEnabled,
      proxySchedulingScope: parsed.data.proxySchedulingScope,
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

  await logUserActivity(
    adminResult.user.id,
    "admin.network_settings_update",
    JSON.stringify({ name: parsed.data.name, networkId }),
    "system",
  );

  revalidatePath("/admin");
  revalidatePath("/people-places");
  revalidatePath("/feed");
  revalidatePath("/proposals");
  revalidatePath("/schedule");
  return { ok: true, message: "Network settings saved." };
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

export interface DraftComposerSettings {
  pollEnabled: boolean;
  schedulingPosting: SchedulingPostingMode;
  proxySchedulingEnabled: boolean;
  proxySchedulingScope: ProxySchedulingScope;
}

/**
 * Member-readable composer flags for new drafts (PC-423–425).
 */
export async function getDraftComposerSettingsAction(): Promise<DraftComposerSettings> {
  const defaults: DraftComposerSettings = {
    pollEnabled: true,
    schedulingPosting: "proposals_only",
    proxySchedulingEnabled: false,
    proxySchedulingScope: "sleeping_partners",
  };
  const networkSession = await requireNetworkSession();
  if (!networkSession.ok) return defaults;
  await ensureDbReady();
  const settings = await loadNetworkSettings(networkSession.user.activeNetworkId);
  return {
    pollEnabled: settings?.pollEnabled !== false,
    schedulingPosting: settings?.schedulingPosting ?? "proposals_only",
    proxySchedulingEnabled: Boolean(settings?.proxySchedulingEnabled),
    proxySchedulingScope: settings?.proxySchedulingScope ?? "sleeping_partners",
  };
}
