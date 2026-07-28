/**
 * Helpers for proposal types that share sleeping schedule/calendar behavior.
 */

import type { ProposalType } from "@/lib/db/schema";

/** True for classic sleeping and FastSleep (overnight / all-day free calendar). */
export function isSleepingLikeType(
  proposalType: ProposalType | string | null | undefined,
): boolean {
  return proposalType === "sleeping" || proposalType === "fast_sleep";
}
