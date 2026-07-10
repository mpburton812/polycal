import { z } from "zod";

import {
  alphaFeedbackKinds,
  alphaFeedbackStatuses,
} from "@/lib/db/schema";

/** Max JPEG screenshot payload accepted from the client (~1.5 MB). */
export const ALPHA_FEEDBACK_MAX_SCREENSHOT_BYTES = 1_500_000;

export const alphaFeedbackSubmitSchema = z.object({
  kind: z.enum(alphaFeedbackKinds),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(4000),
  pagePath: z.string().trim().max(500).optional(),
  viewportWidth: z.number().int().positive().optional(),
  viewportHeight: z.number().int().positive().optional(),
  userAgent: z.string().trim().max(1000).optional(),
  osLabel: z.string().trim().max(120).optional(),
  consoleLogTail: z.array(z.string().max(500)).max(5).optional(),
  /** Base64 JPEG/PNG without data-URL prefix. */
  screenshotBase64: z.string().max(2_500_000).optional(),
  screenshotMimeType: z.enum(["image/jpeg", "image/png", "image/webp"]).optional(),
});

export type AlphaFeedbackSubmitInput = z.infer<typeof alphaFeedbackSubmitSchema>;

export const alphaFeedbackPatchSchema = z.object({
  status: z.enum(alphaFeedbackStatuses).optional(),
  internalComment: z.string().trim().max(4000).nullable().optional(),
  submitterComment: z.string().trim().max(4000).nullable().optional(),
  /** When true, archives the submission; when false, restores to the active list (PC-136). */
  archived: z.boolean().optional(),
});

export type AlphaFeedbackPatchInput = z.infer<typeof alphaFeedbackPatchSchema>;

/** Human-readable status labels for UI and notifications. */
export const ALPHA_FEEDBACK_STATUS_LABELS: Record<
  (typeof alphaFeedbackStatuses)[number],
  string
> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  deferred: "Deferred",
  working_as_designed: "Working As Designed",
  closed: "Closed",
};

/** Best-effort OS label from a user-agent string. */
export function parseOsLabel(userAgent: string | undefined): string {
  if (!userAgent) return "Unknown";
  if (/Windows NT/i.test(userAgent)) return "Windows";
  if (/Mac OS X|Macintosh/i.test(userAgent)) return "macOS";
  if (/Android/i.test(userAgent)) return "Android";
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "iOS";
  if (/Linux/i.test(userAgent)) return "Linux";
  return "Unknown";
}

/** Decodes a base64 screenshot and enforces size/mime limits. */
export function decodeScreenshotPayload(
  base64: string | undefined,
  mimeType: string | undefined,
): { mimeType: string; data: Buffer } | null {
  if (!base64?.trim() || !mimeType) return null;
  let data: Buffer;
  try {
    data = Buffer.from(base64, "base64");
  } catch {
    return null;
  }
  if (data.length === 0 || data.length > ALPHA_FEEDBACK_MAX_SCREENSHOT_BYTES) {
    return null;
  }
  return { mimeType, data };
}
