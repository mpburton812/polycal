import { z } from "zod";

export const MOTD_MAX_BODY_LENGTH = 255;

export const motdScopes = ["platform", "network"] as const;
export type MotdScope = (typeof motdScopes)[number];

export const motdStatuses = ["active", "cleared", "expired"] as const;
export type MotdStatus = (typeof motdStatuses)[number];

export type MotdPublic = {
  id: string;
  scope: MotdScope;
  networkId: string | null;
  body: string;
  createdAt: string;
  endsAt: string | null;
};

export type MotdAdminState = MotdPublic & {
  status: MotdStatus;
  createdByUserId: string | null;
};

/**
 * Validates and normalizes MOTD body text (plain, 1–255 chars).
 */
export function normalizeMotdBody(raw: unknown):
  | { ok: true; body: string }
  | { ok: false; message: string } {
  if (typeof raw !== "string") {
    return { ok: false, message: "Message is required." };
  }
  const body = raw.trim().replace(/\s+/g, " ");
  if (body.length < 1) {
    return { ok: false, message: "Message is required." };
  }
  if (body.length > MOTD_MAX_BODY_LENGTH) {
    return {
      ok: false,
      message: `Message must be at most ${MOTD_MAX_BODY_LENGTH} characters.`,
    };
  }
  return { ok: true, body };
}

/**
 * Parses optional endsAt. Empty/null means no expiry. Must be a future ISO datetime when set.
 */
export function parseOptionalEndsAt(
  raw: unknown,
  nowMs: number = Date.now(),
): { ok: true; endsAt: string | null } | { ok: false; message: string } {
  if (raw === undefined || raw === null || raw === "") {
    return { ok: true, endsAt: null };
  }
  if (typeof raw !== "string") {
    return { ok: false, message: "End date/time must be a string." };
  }
  const trimmed = raw.trim();
  const ms = Date.parse(trimmed);
  if (Number.isNaN(ms)) {
    return { ok: false, message: "End date/time is invalid." };
  }
  if (ms <= nowMs) {
    return { ok: false, message: "End date/time must be in the future." };
  }
  return { ok: true, endsAt: new Date(ms).toISOString() };
}

export const publishMotdInputSchema = z.object({
  body: z.string(),
  endsAt: z.string().nullable().optional(),
});
