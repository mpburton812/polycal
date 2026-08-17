import { eq } from "drizzle-orm";
import { cache } from "react";

import { getDb } from "@/lib/db/client";
import { networks } from "@/lib/db/schema";
import {
  DEFAULT_ONBOARDING_WELCOME_MESSAGE,
  type AuditLogVisibility,
  type PlacesMapVisibility,
  type ProxySchedulingScope,
  type SchedulingPostingMode,
} from "@/types/network-settings";

export type NetworkSettings = {
  networkId: string;
  name: string;
  allowUserProvisioning: boolean;
  adminCanSeeUninvolved: boolean;
  auditLogVisibility: AuditLogVisibility;
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
};

type NetworkSettingsRow = {
  id: string;
  name: string;
  allowUserProvisioning: boolean;
  adminCanSeeUninvolved: boolean;
  auditLogVisibility: string;
  hideSleepingArrangements: boolean;
  seePartnersSleepingArrangements: boolean;
  fastSleepEnabled: boolean | null;
  feedEnabled: boolean | null;
  pollEnabled: boolean | null;
  schedulingPosting: string | null;
  proxySchedulingEnabled: boolean | null;
  proxySchedulingScope: string | null;
  placesMapVisibility: string;
  logTailLength: number;
  onboardingWelcomeMessage: string | null;
  proposedMaxDays: number;
  atRiskTtlDays: number;
  archiveGraceHours: number;
  redraftDeadlineHours: number;
  sleepingPartnerProposalMaxDays: number;
};

function mapNetworkRow(row: NetworkSettingsRow): NetworkSettings {
  return {
    networkId: row.id,
    name: row.name,
    allowUserProvisioning: row.allowUserProvisioning,
    adminCanSeeUninvolved: row.adminCanSeeUninvolved,
    auditLogVisibility: row.auditLogVisibility as AuditLogVisibility,
    hideSleepingArrangements: row.hideSleepingArrangements,
    seePartnersSleepingArrangements: row.seePartnersSleepingArrangements,
    fastSleepEnabled: row.fastSleepEnabled ?? true,
    feedEnabled: row.feedEnabled ?? true,
    pollEnabled: row.pollEnabled ?? true,
    schedulingPosting:
      row.schedulingPosting === "proposals_and_schedule"
        ? "proposals_and_schedule"
        : "proposals_only",
    proxySchedulingEnabled: row.proxySchedulingEnabled ?? false,
    proxySchedulingScope:
      row.proxySchedulingScope === "anyone" ? "anyone" : "sleeping_partners",
    placesMapVisibility: row.placesMapVisibility as PlacesMapVisibility,
    logTailLength: row.logTailLength,
    onboardingWelcomeMessage:
      row.onboardingWelcomeMessage ?? DEFAULT_ONBOARDING_WELCOME_MESSAGE,
    proposedMaxDays: row.proposedMaxDays,
    atRiskTtlDays: row.atRiskTtlDays,
    archiveGraceHours: row.archiveGraceHours,
    redraftDeadlineHours: row.redraftDeadlineHours,
    sleepingPartnerProposalMaxDays: row.sleepingPartnerProposalMaxDays,
  };
}

/**
 * Request-memoized load of network settings (avoids duplicate round-trips in
 * feed/schedule/admin gates within one server turn) — PC-397.
 */
const loadNetworkSettingsMemo = cache(async (networkId: string): Promise<NetworkSettings | null> => {
  const db = getDb();
  const [row] = await db
    .select({
      id: networks.id,
      name: networks.name,
      allowUserProvisioning: networks.allowUserProvisioning,
      adminCanSeeUninvolved: networks.adminCanSeeUninvolved,
      auditLogVisibility: networks.auditLogVisibility,
      hideSleepingArrangements: networks.hideSleepingArrangements,
      seePartnersSleepingArrangements: networks.seePartnersSleepingArrangements,
      fastSleepEnabled: networks.fastSleepEnabled,
      feedEnabled: networks.feedEnabled,
      pollEnabled: networks.pollEnabled,
      schedulingPosting: networks.schedulingPosting,
      proxySchedulingEnabled: networks.proxySchedulingEnabled,
      proxySchedulingScope: networks.proxySchedulingScope,
      placesMapVisibility: networks.placesMapVisibility,
      logTailLength: networks.logTailLength,
      onboardingWelcomeMessage: networks.onboardingWelcomeMessage,
      proposedMaxDays: networks.proposedMaxDays,
      atRiskTtlDays: networks.atRiskTtlDays,
      archiveGraceHours: networks.archiveGraceHours,
      redraftDeadlineHours: networks.redraftDeadlineHours,
      sleepingPartnerProposalMaxDays: networks.sleepingPartnerProposalMaxDays,
    })
    .from(networks)
    .where(eq(networks.id, networkId))
    .limit(1);
  if (!row) return null;
  return mapNetworkRow(row);
});

/**
 * Loads per-network settings from the `networks` row (PC-363 isolation).
 * When `db` is omitted (typical), results are request-memoized via React.cache.
 */
export async function loadNetworkSettings(
  networkId: string,
  db?: ReturnType<typeof getDb>,
): Promise<NetworkSettings | null> {
  if (!db) {
    return loadNetworkSettingsMemo(networkId);
  }
  const [row] = await db
    .select({
      id: networks.id,
      name: networks.name,
      allowUserProvisioning: networks.allowUserProvisioning,
      adminCanSeeUninvolved: networks.adminCanSeeUninvolved,
      auditLogVisibility: networks.auditLogVisibility,
      hideSleepingArrangements: networks.hideSleepingArrangements,
      seePartnersSleepingArrangements: networks.seePartnersSleepingArrangements,
      fastSleepEnabled: networks.fastSleepEnabled,
      feedEnabled: networks.feedEnabled,
      pollEnabled: networks.pollEnabled,
      schedulingPosting: networks.schedulingPosting,
      proxySchedulingEnabled: networks.proxySchedulingEnabled,
      proxySchedulingScope: networks.proxySchedulingScope,
      placesMapVisibility: networks.placesMapVisibility,
      logTailLength: networks.logTailLength,
      onboardingWelcomeMessage: networks.onboardingWelcomeMessage,
      proposedMaxDays: networks.proposedMaxDays,
      atRiskTtlDays: networks.atRiskTtlDays,
      archiveGraceHours: networks.archiveGraceHours,
      redraftDeadlineHours: networks.redraftDeadlineHours,
      sleepingPartnerProposalMaxDays: networks.sleepingPartnerProposalMaxDays,
    })
    .from(networks)
    .where(eq(networks.id, networkId))
    .limit(1);
  if (!row) return null;
  return mapNetworkRow(row);
}

/**
 * Resolves settings for a specific network, or the first active network when
 * `networkId` is omitted (cron / legacy call sites).
 */
export async function resolveNetworkSettings(
  db: ReturnType<typeof getDb> = getDb(),
  networkId?: string | null,
): Promise<NetworkSettings | null> {
  if (networkId) {
    return loadNetworkSettings(networkId, db);
  }
  const [row] = await db.select({ id: networks.id }).from(networks).limit(1);
  if (!row) return null;
  return loadNetworkSettings(row.id, db);
}
