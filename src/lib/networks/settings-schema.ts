import { z } from "zod";

import {
  auditLogVisibilityLevels,
  placesMapVisibilityLevels,
  proxySchedulingScopes,
  schedulingPostingModes,
} from "@/types/network-settings";
import {
  LONG_TEXT_MAX,
  maxCharsMessage,
  requiredLimitedString,
} from "@/lib/validation/string-limits";

/**
 * Full Network Configuration shape. Kept out of `"use server"` so unit tests
 * can validate patches without importing Next/Auth (PC-461).
 */
export const networkSettingsSchema = z.object({
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

/** Partial patch for autosave — at least one known key required (PC-461). */
export const settingsPatchSchema = networkSettingsSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: "No settings to update." },
);

export type NetworkSettingsPatch = z.infer<typeof settingsPatchSchema>;
