import { eq } from "drizzle-orm";

import type { getDb } from "@/lib/db/client";
import { proposalInvitees } from "@/lib/db/schema";
import { notifyUser } from "@/lib/notifications";

type Db = ReturnType<typeof getDb>;

/**
 * A notification recipient resolved from a proposal's stakeholder set (PC-322).
 * `role` / `voteStatus` are populated from the invitee row (null for a
 * proposer who is not also an invitee) so wrappers can vary copy per audience
 * (e.g. optional-RSVP resolve, at-risk proposer vs invitee) without re-querying.
 */
export interface ProposalRecipient {
  userId: string;
  isProposer: boolean;
  role: string | null;
  voteStatus: string | null;
}

/** Message string, or a resolver invoked per recipient for audience-specific copy. */
type ParticipantMessage = string | ((recipient: ProposalRecipient) => string);

export interface NotifyProposalParticipantsOptions {
  proposalId: string;
  proposerId: string;
  /** notifyUser type discriminator (e.g. `proposal_resolved`). */
  notificationType: string;
  /** Shared copy, or a per-recipient resolver for special-case wrappers. */
  message: ParticipantMessage;
  /**
   * Metadata merged into every recipient's payload. `proposalId` is always
   * injected, so callers only supply the extra context (title, type, action…).
   */
  metadata?: Record<string, unknown>;
  /**
   * Optional per-recipient metadata merged last — lets thin wrappers vary the
   * deep-link `action` (e.g. proposer `at_risk_options` vs invitee `vote`)
   * without duplicating the fan-out loop.
   */
  metadataFor?: (recipient: ProposalRecipient) => Record<string, unknown>;
}

/**
 * Notifies a proposal's proposer and all invitees exactly once (deduplicated),
 * with shared metadata defaults plus optional per-recipient message/metadata
 * overrides (PC-322).
 *
 * This is the single fan-out path for stakeholder notifications: it loads the
 * invitee set, unions the proposer, and delegates delivery/preference handling
 * to `notifyUser`. Copy and metadata are supplied by callers so behavior is
 * preserved verbatim when replacing hand-rolled loops.
 */
export async function notifyProposalParticipants(
  db: Db,
  options: NotifyProposalParticipantsOptions,
): Promise<void> {
  const { proposalId, proposerId, notificationType, message, metadata, metadataFor } = options;

  const invitees = await db
    .select({
      userId: proposalInvitees.userId,
      role: proposalInvitees.role,
      voteStatus: proposalInvitees.voteStatus,
    })
    .from(proposalInvitees)
    .where(eq(proposalInvitees.proposalId, proposalId));

  const inviteeByUserId = new Map(invitees.map((row) => [row.userId, row]));
  const notifyIds = new Set<string>([proposerId, ...invitees.map((row) => row.userId)]);

  for (const userId of notifyIds) {
    const inviteeRow = inviteeByUserId.get(userId);
    const recipient: ProposalRecipient = {
      userId,
      isProposer: userId === proposerId,
      role: inviteeRow?.role ?? null,
      voteStatus: inviteeRow?.voteStatus ?? null,
    };

    const resolvedMessage = typeof message === "function" ? message(recipient) : message;

    await notifyUser(userId, notificationType, resolvedMessage, {
      proposalId,
      ...metadata,
      ...(metadataFor ? metadataFor(recipient) : {}),
    });
  }
}
