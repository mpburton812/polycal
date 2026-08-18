import { z } from "zod";

import { EVENT_ICON_KEYS } from "@/lib/event-icons/registry";
import { MAX_FEED_IMAGES } from "@/lib/feed/images";
import { batchSleepingEntriesSchema } from "@/lib/proposals/batch-sleeping";
import {
  LONG_TEXT_MAX,
  SHORT_TEXT_MAX,
  limitedString,
  maxCharsMessage,
  requiredLimitedString,
} from "@/lib/validation/string-limits";

export const inviteeInputSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(["required", "optional", "booked"]),
});

export const timeSlotInputSchema = z.object({
  startAt: z.string().min(1),
  endAt: z.string().optional(),
  label: limitedString("Slot label", LONG_TEXT_MAX).optional(),
  isAllDay: z.boolean().optional(),
});

export const recurrenceRuleSchema = z.object({
  pattern: z.enum(["daily", "weekly", "monthly", "yearly"]),
  interval: z.number().int().min(1).max(12).default(1),
  count: z.number().int().min(2).max(52),
});

export const draftProposalSchema = z.object({
  title: requiredLimitedString("Title", LONG_TEXT_MAX),
  description: limitedString("Description", LONG_TEXT_MAX).optional(),
  proposalType: z.enum(["event", "sleeping"]),
  locationId: z.string().optional(),
  locationText: limitedString("Location", SHORT_TEXT_MAX).optional(),
  notes: limitedString("Notes", LONG_TEXT_MAX).optional(),
  intentionalSolo: z.boolean().optional(),
  isPoll: z.boolean().optional(),
  isAllDay: z.boolean().optional(),
  invitees: z.array(inviteeInputSchema).optional(),
  timeSlots: z.array(timeSlotInputSchema).max(10).optional(),
  isRecurring: z.boolean().optional(),
  recurrenceRule: recurrenceRuleSchema.optional(),
  bedroomIndex: z.number().int().min(0).max(19).optional(),
  isBatchSleeping: z.boolean().optional(),
  batchEntries: batchSleepingEntriesSchema.optional(),
  reminderOffsetMinutes: z.number().int().min(1).max(525600).nullable().optional(),
  eventIconKey: z.enum(EVENT_ICON_KEYS).nullable().optional(),
  /** When true, lifecycle milestones post to the network Feed (PC-414). Default false. */
  postToFeed: z.boolean().optional(),
  postingKind: z.enum(["proposal", "booking"]).optional(),
  onBehalfOfUserId: z.string().min(1).nullable().optional(),
});

export const commentSchema = z
  .object({
    proposalId: z.string().min(1),
    body: z
      .string()
      .trim()
      .max(LONG_TEXT_MAX, maxCharsMessage("Comment", LONG_TEXT_MAX))
      .optional()
      .default(""),
    sliceTag: limitedString("Slice tag", LONG_TEXT_MAX).optional().nullable(),
    imageIds: z.array(z.string().min(1)).max(MAX_FEED_IMAGES).optional(),
  })
  .refine((data) => data.body.length > 0 || (data.imageIds?.length ?? 0) > 0, {
    message: "Comment cannot be empty.",
  });

export const voteSchema = z.object({
  proposalId: z.string().min(1),
  vote: z.enum(["accept", "abstain", "decline", "accept_suboptimal"]),
  /** When set, cast this vote on behalf of a passive invitee the actor added (PC-246). */
  onBehalfOfUserId: z.string().min(1).optional(),
});

export const slotVoteSchema = z.object({
  proposalId: z.string().min(1),
  timeSlotId: z.string().min(1),
  vote: z.enum(["accept", "abstain", "decline", "accept_suboptimal"]),
  /** When set, cast this slot vote on behalf of a passive invitee (PC-246). */
  onBehalfOfUserId: z.string().min(1).optional(),
});

export const attendeeUpdateSchema = z.object({
  proposalId: z.string().min(1),
  addRequired: z.array(z.string().min(1)).optional(),
  addOptional: z.array(z.string().min(1)).optional(),
  addBooked: z.array(z.string().min(1)).optional(),
  removeUserIds: z.array(z.string().min(1)).optional(),
});

export const attendeeUpdateResponseSchema = z.object({
  proposalId: z.string().min(1),
  response: z.enum(["maintain", "decline"]),
});

export const rescheduleProposalSchema = z.object({
  proposalId: z.string().min(1),
  scheduledStartAt: z.string().min(1),
  scheduledEndAt: z.string().optional(),
  isAllDay: z.boolean().optional(),
});
