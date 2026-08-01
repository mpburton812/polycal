import { z } from "zod";

/** Location and About Me (PC-244). */
export const SHORT_TEXT_MAX = 256;

/** All other free-text content fields (PC-244). */
export const LONG_TEXT_MAX = 1024;

/**
 * Human-readable max-length message for Zod and UI helpers.
 */
export function maxCharsMessage(fieldLabel: string, max: number): string {
  return `${fieldLabel} must be ${max} characters or fewer.`;
}

/**
 * Trimmed string with a labeled max-length error (PC-244).
 */
export function limitedString(fieldLabel: string, max: number) {
  return z.string().trim().max(max, maxCharsMessage(fieldLabel, max));
}

/**
 * Required non-empty trimmed string with a labeled max-length error.
 */
export function requiredLimitedString(fieldLabel: string, max: number) {
  return z
    .string()
    .trim()
    .min(1, `${fieldLabel} is required.`)
    .max(max, maxCharsMessage(fieldLabel, max));
}
