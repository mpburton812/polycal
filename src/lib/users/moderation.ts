import type { UserStatus } from "@/types/user";

export interface ModerationDisplay {
  reason: string | null;
  expiresAt: string | null;
}

/** Returns true when a timed moderation period has elapsed. */
export function moderationExpired(expiresAt: string | null | undefined): boolean {
  if (!expiresAt?.trim()) return false;
  return new Date(expiresAt).getTime() <= Date.now();
}

/** Builds an ISO expiry from optional day count (null when open-ended). */
export function moderationExpiresFromDays(days: number | null | undefined): string | null {
  if (days == null || !Number.isFinite(days) || days <= 0) return null;
  const expires = new Date();
  expires.setDate(expires.getDate() + Math.floor(days));
  return expires.toISOString();
}

export function formatModerationExpiry(expiresAt: string | null | undefined): string | null {
  if (!expiresAt?.trim()) return null;
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function isRestrictedStatus(status: UserStatus): boolean {
  return status === "paused" || status === "banned";
}
