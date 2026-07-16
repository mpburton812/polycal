import { randomUUID } from "node:crypto";
import { z } from "zod";

import {
  LONG_TEXT_MAX,
  SHORT_TEXT_MAX,
  limitedString,
} from "@/lib/validation/string-limits";

/** One night within a batch sleeping proposal (embedded mini-proposal). */
export const batchSleepingEntrySchema = z.object({
  id: z.string().min(1),
  nightDate: z.string().min(1),
  locationId: z.string().optional(),
  locationText: limitedString("Location", SHORT_TEXT_MAX).optional(),
  bedroomIndex: z.number().int().min(0).optional(),
  intentionalSolo: z.boolean().optional(),
  /** Optional per-night note stored in batchEntriesJson (PC-59 / PC-244). */
  comment: limitedString("Comment", LONG_TEXT_MAX).optional(),
  invitees: z
    .array(
      z.object({
        userId: z.string().min(1),
        role: z.enum(["required", "optional"]),
      }),
    )
    .default([]),
});

export type BatchSleepingEntry = z.infer<typeof batchSleepingEntrySchema>;

export const batchSleepingEntriesSchema = z.array(batchSleepingEntrySchema).min(1).max(14);

/** JSON stored on proposal_time_slots.label for per-night metadata in batch proposals. */
export const batchSlotMetaSchema = z.object({
  batchEntryId: z.string(),
  locationId: z.string().optional(),
  locationText: limitedString("Location", SHORT_TEXT_MAX).optional(),
  bedroomIndex: z.number().int().min(0).optional(),
  intentionalSolo: z.boolean().optional(),
  inviteeUserIds: z.array(z.string()).default([]),
});

export type BatchSlotMeta = z.infer<typeof batchSlotMetaSchema>;

export function encodeBatchSlotMeta(meta: BatchSlotMeta): string {
  return JSON.stringify(meta);
}

export function parseBatchSlotMeta(label: string | null | undefined): BatchSlotMeta | null {
  if (!label?.trim()) return null;
  try {
    const parsed = JSON.parse(label) as unknown;
    const result = batchSlotMetaSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function parseBatchEntriesJson(raw: string | null | undefined): BatchSleepingEntry[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    const result = batchSleepingEntriesSchema.safeParse(parsed);
    return result.success ? result.data : [];
  } catch {
    return [];
  }
}

/** Union invitees across batch entries for proposal-level voting. */
export function unionBatchInvitees(
  entries: BatchSleepingEntry[],
): { userId: string; role: "required" | "optional" }[] {
  const map = new Map<string, "required" | "optional">();
  for (const entry of entries) {
    if (entry.intentionalSolo) continue;
    for (const invitee of entry.invitees) {
      const existing = map.get(invitee.userId);
      if (!existing || invitee.role === "required") {
        map.set(invitee.userId, invitee.role);
      }
    }
  }
  return [...map.entries()].map(([userId, role]) => ({ userId, role }));
}

export function newBatchEntryId(): string {
  return `bse-${randomUUID()}`;
}
