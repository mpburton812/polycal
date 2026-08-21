"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { logUserActivity } from "@/lib/audit";
import { logPlatformEvent } from "@/lib/platform-log";
import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import { networks } from "@/lib/db/schema";
import { requireNetworkAdmin, requireNetworkSession } from "@/lib/networks/context";
import { loadNetworkSettings, resolveNetworkSettings } from "@/lib/networks/settings";
import {
  bookingsEnabled,
  type AuditLogVisibility,
  type NetworkSettings,
  type PlacesMapVisibility,
  type ProxySchedulingScope,
  type SchedulingPostingMode,
} from "@/types/network-settings";
import {
  settingsPatchSchema,
  type NetworkSettingsPatch,
} from "@/lib/networks/settings-schema";

export type { PlacesMapVisibility };

export interface NetworkSettingsActionResult {
  ok: boolean;
  message: string;
}

export { settingsPatchSchema, type NetworkSettingsPatch };

const HIGH_SIGNAL_KEYS = new Set(["name", "feedEnabled"]);

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
 * Persists a partial settings patch for the active network (PC-30 / PC-364 / PC-461).
 */
export async function updateNetworkSettingsAction(
  input: Partial<NetworkSettings>,
): Promise<NetworkSettingsActionResult> {
  const adminResult = await requireNetworkAdmin();
  if (!adminResult.ok) {
    return { ok: false, message: adminResult.message };
  }

  const parsed = settingsPatchSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid settings." };
  }

  await ensureDbReady();
  const db = getDb();
  const networkId = adminResult.user.activeNetworkId;
  const [current] = await db
    .select()
    .from(networks)
    .where(eq(networks.id, networkId))
    .limit(1);
  if (!current) {
    return { ok: false, message: "Network not found." };
  }

  const patch = parsed.data;
  const nextScheduling = patch.schedulingPosting ?? current.schedulingPosting;
  const now = new Date().toISOString();

  await db
    .update(networks)
    .set({
      ...patch,
      pollEnabled:
        nextScheduling === "bookings_only"
          ? false
          : (patch.pollEnabled ?? current.pollEnabled),
      proxySchedulingEnabled: bookingsEnabled(nextScheduling),
      updatedAt: now,
    })
    .where(eq(networks.id, networkId));

  await logUserActivity(
    adminResult.user.id,
    "admin.network_settings_update",
    JSON.stringify({ keys: Object.keys(patch), networkId }),
    "system",
  );

  const highSignal = Object.keys(patch).filter((key) => HIGH_SIGNAL_KEYS.has(key));
  if (highSignal.length > 0) {
    const name = patch.name ?? current.name;
    await logPlatformEvent({
      actorUserId: adminResult.user.id,
      networkId,
      networkName: name,
      action: "admin.network_settings_update",
      summary: highSignal.includes("name")
        ? `Network renamed to ${name}`
        : `Feed ${patch.feedEnabled ? "enabled" : "disabled"} on ${name}`,
      severity: "major",
    });
  }

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
    pollEnabled:
      settings?.schedulingPosting === "bookings_only" ? false : settings?.pollEnabled !== false,
    schedulingPosting: settings?.schedulingPosting ?? "proposals_only",
    proxySchedulingEnabled: bookingsEnabled(settings?.schedulingPosting ?? "proposals_only"),
    proxySchedulingScope: settings?.proxySchedulingScope ?? "sleeping_partners",
  };
}
