/**
 * Aggregate fingerprint of one feed-bearing table: row count plus the newest
 * created/deleted timestamps. Insert bumps count + maxCreatedAt; soft-delete
 * bumps maxDeletedAt — so any content change moves the fingerprint (PC-336).
 */
export interface FeedFingerprintTable {
  count: number;
  maxCreatedAt: string | null;
  /** Soft-delete timestamp bump (chat, comments, milestones). */
  maxDeletedAt?: string | null;
}

/** Minimal active-event descriptor used to fingerprint the pinned stack. */
export interface FeedFingerprintActiveEvent {
  proposalId: string;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  proposalState: string;
}

/**
 * All cheap aggregates needed to detect a first-page feed change without loading
 * the full feed list. Each field is a small COUNT/MAX query rather than a scan of
 * hydrated rows (PC-336).
 */
export interface FeedFingerprintInput {
  milestones: FeedFingerprintTable;
  /** Catches proposal title/time edits that reshape a visible milestone. */
  proposals: { maxUpdatedAt: string | null };
  chatMessages: FeedFingerprintTable;
  chatComments: FeedFingerprintTable;
  proposalComments: FeedFingerprintTable;
  /** Global like activity + this viewer's own like count (multi-device safety). */
  likes: FeedFingerprintTable & { viewerCount: number };
  activeEvents: FeedFingerprintActiveEvent[];
}

function tablePart(table: FeedFingerprintTable): string {
  return [table.count, table.maxCreatedAt ?? "", table.maxDeletedAt ?? ""].join(":");
}

/**
 * Builds a compact, deterministic token from cheap feed aggregates. The Feed
 * client compares the token between polls and skips a full reload when it is
 * unchanged (PC-239 silent poll / PC-336 cheap query). Any add/delete/like/edit
 * that could alter the first-page head or the active-event pins changes the token.
 */
export function composeFeedFingerprint(input: FeedFingerprintInput): string {
  const activePart = input.activeEvents
    .map((event) =>
      [
        event.proposalId,
        event.scheduledStartAt ?? "",
        event.scheduledEndAt ?? "",
        event.proposalState,
      ].join(":"),
    )
    .join(",");

  return [
    `m:${tablePart(input.milestones)}`,
    `p:${input.proposals.maxUpdatedAt ?? ""}`,
    `cm:${tablePart(input.chatMessages)}`,
    `cc:${tablePart(input.chatComments)}`,
    `pc:${tablePart(input.proposalComments)}`,
    `l:${tablePart(input.likes)}:${input.likes.viewerCount}`,
    `a:${activePart}`,
  ].join("|");
}
