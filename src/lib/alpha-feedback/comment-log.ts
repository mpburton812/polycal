/**
 * Append-only triage comment history for Alpha Feedback tickets (PC-183).
 */

export interface AlphaFeedbackCommentLogEntry {
  at: string;
  internalComment?: string;
  submitterComment?: string;
}

/** Parses stored JSON comment log; returns [] on missing/invalid data. */
export function parseAlphaFeedbackCommentLog(
  raw: string | null | undefined,
): AlphaFeedbackCommentLogEntry[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is AlphaFeedbackCommentLogEntry =>
        Boolean(entry) &&
        typeof entry === "object" &&
        typeof (entry as AlphaFeedbackCommentLogEntry).at === "string",
    );
  } catch {
    return [];
  }
}

/**
 * Appends a log entry when either draft comment is non-empty.
 * Returns null when there is nothing to append.
 */
export function appendAlphaFeedbackCommentLog(
  existingRaw: string | null | undefined,
  drafts: { internalComment?: string | null; submitterComment?: string | null },
  at: string = new Date().toISOString(),
): { logJson: string; entry: AlphaFeedbackCommentLogEntry } | null {
  const internal = drafts.internalComment?.trim() || undefined;
  const submitter = drafts.submitterComment?.trim() || undefined;
  if (!internal && !submitter) return null;

  const entry: AlphaFeedbackCommentLogEntry = {
    at,
    ...(internal ? { internalComment: internal } : {}),
    ...(submitter ? { submitterComment: submitter } : {}),
  };
  const next = [...parseAlphaFeedbackCommentLog(existingRaw), entry];
  return { logJson: JSON.stringify(next), entry };
}
