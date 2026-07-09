import { z } from "zod";

import { EVENT_ICON_KEYS } from "@/lib/event-icons/registry";
import { batchSleepingEntriesSchema } from "@/lib/proposals/batch-sleeping";

export const inviteeInputSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(["required", "optional"]),
});

export const timeSlotInputSchema = z.object({
  startAt: z.string().min(1),
  endAt: z.string().optional(),
  label: z.string().trim().max(120).optional(),
  isAllDay: z.boolean().optional(),
});

export const recurrenceRuleSchema = z.object({
  pattern: z.enum(["daily", "weekly", "monthly", "yearly"]),
  interval: z.number().int().min(1).max(12).default(1),
  count: z.number().int().min(2).max(52),
});

export const draftProposalSchema = z.object({
  title: z.string().trim().min(1, "Title is required.").max(200),
  description: z.string().trim().max(2000).optional(),
  proposalType: z.enum(["event", "sleeping"]),
  locationId: z.string().optional(),
  locationText: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(500).optional(),
  intentionalSolo: z.boolean().optional(),
  isPoll: z.boolean().optional(),
  isAllDay: z.boolean().optional(),
  eventPrivacy: z.enum(["open", "private", "super_private"]).optional(),
  invitees: z.array(inviteeInputSchema).optional(),
  timeSlots: z.array(timeSlotInputSchema).max(10).optional(),
  isRecurring: z.boolean().optional(),
  recurrenceRule: recurrenceRuleSchema.optional(),
  bedroomIndex: z.number().int().min(0).max(19).optional(),
  isBatchSleeping: z.boolean().optional(),
  batchEntries: batchSleepingEntriesSchema.optional(),
  reminderOffsetMinutes: z.number().int().min(1).max(525600).nullable().optional(),
  eventIconKey: z.enum(EVENT_ICON_KEYS).nullable().optional(),
});

export const commentSchema = z.object({
  proposalId: z.string().min(1),
  body: z.string().trim().min(1, "Comment cannot be empty.").max(2000),
  sliceTag: z.string().trim().max(120).optional().nullable(),
});

export const voteSchema = z.object({
  proposalId: z.string().min(1),
  vote: z.enum(["accept", "abstain", "decline", "accept_suboptimal"]),
});

export const slotVoteSchema = z.object({
  proposalId: z.string().min(1),
  timeSlotId: z.string().min(1),
  vote: z.enum(["accept", "abstain", "decline", "accept_suboptimal"]),
});

export const attendeeUpdateSchema = z.object({
  proposalId: z.string().min(1),
  addRequired: z.array(z.string().min(1)).optional(),
  addOptional: z.array(z.string().min(1)).optional(),
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
