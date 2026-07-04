/** Human-readable labels for admin activity-log action codes (PC-63). */
export function formatActivityLogAction(action: string): string {
  if (action === "admin.impersonate") return "Impersonation";
  return action;
}

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

    if (
      (action === "residency.comment" || action.endsWith(".comment")) &&
      typeof parsed.body === "string"
    ) {
      return parsed.body;
    }

    if (
      action === "residency.proposed" ||
      action === "places.propose_residency" ||
      action === "residency.accepted" ||
      action === "places.accept_residency"
    ) {
      const place = typeof parsed.placeName === "string" ? parsed.placeName : null;
      const invitee =
        typeof parsed.inviteeName === "string"
          ? parsed.inviteeName
          : typeof parsed.targetUserId === "string"
            ? parsed.targetUserId
            : null;
      const parts = [place, invitee ? `invitee: ${invitee}` : null].filter(Boolean);
      if (parts.length > 0) return parts.join(" · ");
    }

    if (
      action === "residency.declined" ||
      action === "places.decline_residency"
    ) {
      if (typeof parsed.reason === "string" && parsed.reason.trim()) {
        return parsed.reason.trim();
      }
      if (typeof parsed.placeName === "string") {
        return parsed.placeName;
      }
    }

    if (action === "admin.impersonate") {
      const targetName =
        typeof parsed.targetDisplayName === "string"
          ? parsed.targetDisplayName
          : typeof parsed.targetName === "string"
            ? parsed.targetName
            : null;
      const targetId =
        typeof parsed.targetUserId === "string" ? parsed.targetUserId : null;
      if (targetName) return `Target: ${targetName}`;
      if (targetId) return `Target user id: ${targetId}`;
    }

    if (typeof parsed.message === "string") {
      return parsed.message;
    }
  } catch {
    return details;
  }

  return details;
}
