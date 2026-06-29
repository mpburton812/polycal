/**
 * Formats raw activity-log detail JSON for admin UI (PC-71 JSON presentation audit).
 */
export function formatActivityLogDetails(action: string, details: string | null): string {
  if (!details?.trim()) return "";

  try {
    const parsed = JSON.parse(details) as Record<string, unknown>;

    if (action.startsWith("notification.")) {
      if (typeof parsed.message === "string" && parsed.message.trim()) {
        return parsed.message.trim();
      }
      if (typeof parsed.url === "string") {
        return parsed.url;
      }
    }

    if (action === "proposal.comment_added" && typeof parsed.body === "string") {
      return parsed.body;
    }

    if (typeof parsed.message === "string") {
      return parsed.message;
    }
  } catch {
    return details;
  }

  return details;
}
