import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { networks } from "@/lib/db/schema";
import {
  DEFAULT_ONBOARDING_WELCOME_MESSAGE,
  type AuditLogVisibility,
  type PlacesMapVisibility,
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
  placesMapVisibility: PlacesMapVisibility;
  logTailLength: number;
  onboardingWelcomeMessage: string;
  proposedMaxDays: number;
  atRiskTtlDays: number;
  archiveGraceHours: number;
  redraftDeadlineHours: number;
  sleepingPartnerProposalMaxDays: number;
};

/**
 * Loads per-network settings from the `networks` row (PC-363 isolation).
 */
export async function loadNetworkSettings(
  networkId: string,
  db: ReturnType<typeof getDb> = getDb(),
): Promise<NetworkSettings | null> {
  const [row] = await db
    .select()
    .from(networks)
    .where(eq(networks.id, networkId))
    .limit(1);
  if (!row) return null;
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
