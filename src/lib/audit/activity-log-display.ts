/** Human-readable labels for admin activity-log action codes (PC-63 / PC-245). */
const ACTION_LABELS: Record<string, string> = {
  "admin.impersonate": "Impersonation",
  "admin.fast_sleeping_plan_add": "Fast sleeping plan add",
  "admin.force_reload": "Forced reload",
  "users.create_active": "Created active user",
  "users.create_passive": "Created proxy profile",
  "users.admin_pause": "Paused user",
  "users.admin_resume": "Resumed user",
  "users.admin_delete": "Deleted user",
  "users.admin_update": "Updated user",
  "users.activate_passive": "Activated proxy user",
  "users.admin_reset_password": "Reset password",
  "places.create": "Created place",
  "places.update": "Updated place",
  "places.delete": "Deleted place",
  "places.add_person": "Added person to place",
  "places.remove_person": "Removed person from place",
  "places.update_member_role": "Updated place member role",
  "places.propose_residency": "Proposed residency",
  "places.accept_residency": "Accepted residency",
  "places.decline_residency": "Declined residency",
  "partnership.propose": "Proposed partnership",
  "partnership.accept": "Accepted partnership",
  "partnership.decline": "Declined partnership",
  "profile.notification_email_requested": "Notification email verification sent",
  "profile.notification_email_verified": "Notification email verified",
  "profile.notification_email_cleared": "Notification email cleared",
  "residency.proposed": "Residency proposed",
  "residency.accepted": "Residency accepted",
  "residency.declined": "Residency declined",
  "residency.comment": "Residency comment",
  "proposals.admin_delete": "Admin deleted proposal",
  "proposals.draft_delete": "Deleted draft proposal",
  "proposal.admin_rescheduled": "Admin rescheduled proposal",
  "schedule.slice_detail_error": "Schedule slice detail error",
  "schedule.slice_detach_error": "Schedule slice detach error",
};

/**
 * Formats an activity-log action code for admin UI display (PC-245).
 */
export function formatActivityLogAction(action: string): string {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];
  if (action.startsWith("notification.")) {
    return "Notification";
  }
  return action.replaceAll(".", " · ").replaceAll("_", " ");
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Extracts the initiating user from notification metadata for admin-log attribution (PC-299).
 */
export function getNotificationActivityActor(
  action: string,
  details: string | null,
): { actorUserId: string; actorDisplayName: string } | null {
  if (!action.startsWith("notification.") || !details?.trim()) return null;
  try {
    const parsed = JSON.parse(details) as Record<string, unknown>;
    const actorUserId = asString(parsed.actorUserId);
    const actorDisplayName = asString(parsed.actorDisplayName);
    return actorUserId && actorDisplayName ? { actorUserId, actorDisplayName } : null;
  } catch {
    return null;
  }
}

/**
 * True when a string looks like a JSON object/array (should not be shown raw).
 */
function looksLikeJson(value: string): boolean {
  const trimmed = value.trim();
  return (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  );
}

/**
 * Formats raw activity-log detail JSON for admin UI (PC-71 / PC-245).
 * Never returns raw JSON — falls back to a short human phrase.
 */
export function formatActivityLogDetails(action: string, details: string | null): string {
  if (!details?.trim()) return "";

  try {
    const parsed = JSON.parse(details) as Record<string, unknown>;

    if (action.startsWith("notification.")) {
      const message = asString(parsed.message);
      const recipient = asString(parsed.recipientDisplayName);
      const parts = [recipient ? `Notified: ${recipient}` : null, message].filter(Boolean);
      if (parts.length > 0) return parts.join(" · ");
      const url = asString(parsed.url);
      if (url) return url;
    }

    if (action === "proposal.comment_added" && asString(parsed.body)) {
      return asString(parsed.body)!;
    }

    if (
      (action === "residency.comment" || action.endsWith(".comment")) &&
      asString(parsed.body)
    ) {
      return asString(parsed.body)!;
    }

    if (
      action === "residency.proposed" ||
      action === "places.propose_residency" ||
      action === "residency.accepted" ||
      action === "places.accept_residency"
    ) {
      const place = asString(parsed.placeName);
      const invitee =
        asString(parsed.inviteeName) ?? asString(parsed.targetDisplayName) ?? asString(parsed.targetUserId);
      const parts = [place, invitee ? `invitee: ${invitee}` : null].filter(Boolean);
      if (parts.length > 0) return parts.join(" · ");
    }

    if (action === "residency.declined" || action === "places.decline_residency") {
      const reason = asString(parsed.reason);
      if (reason) return reason;
      const place = asString(parsed.placeName);
      if (place) return place;
    }

    if (action === "admin.impersonate") {
      const targetName =
        asString(parsed.targetDisplayName) ?? asString(parsed.targetName);
      const targetId = asString(parsed.targetUserId);
      if (targetName) return `Target: ${targetName}`;
      if (targetId) return `Target user id: ${targetId}`;
    }

    if (action === "admin.fast_sleeping_plan_add") {
      const targetName = asString(parsed.targetDisplayName);
      const nightCount = asNumber(parsed.nightCount);
      const parts = [
        targetName ? `Target: ${targetName}` : null,
        nightCount !== null ? `${nightCount} night${nightCount === 1 ? "" : "s"}` : null,
      ].filter(Boolean);
      if (parts.length > 0) return parts.join(" · ");
    }

    if (
      action === "users.create_active" ||
      action === "users.create_passive" ||
      action === "users.admin_pause" ||
      action === "users.admin_resume" ||
      action === "users.admin_delete" ||
      action === "users.activate_passive" ||
      action === "users.admin_update" ||
      action === "users.admin_reset_password"
    ) {
      const name = asString(parsed.displayName) ?? asString(parsed.username);
      const userId = asString(parsed.userId);
      if (name) return name;
      if (userId) return `User ${userId}`;
    }

    if (
      action === "places.add_person" ||
      action === "places.remove_person" ||
      action === "places.update_member_role"
    ) {
      const place = asString(parsed.placeName) ?? asString(parsed.locationId);
      const person =
        asString(parsed.targetDisplayName) ??
        asString(parsed.displayName) ??
        asString(parsed.targetUserId);
      const role = asString(parsed.placeRole) ?? asString(parsed.role);
      const parts = [
        person,
        role ? `as ${role}` : null,
        place ? `at ${place}` : null,
      ].filter(Boolean);
      if (parts.length > 0) return parts.join(" ");
    }

    if (action === "places.create" || action === "places.update" || action === "places.delete") {
      const place = asString(parsed.placeName) ?? asString(parsed.name) ?? asString(parsed.locationId);
      if (place) return place;
      const moved = asNumber(parsed.movedProposalCount);
      if (moved !== null) return `${moved} proposal${moved === 1 ? "" : "s"} moved`;
    }

    if (
      action === "partnership.propose" ||
      action === "partnership.accept" ||
      action === "partnership.decline"
    ) {
      const a = asString(parsed.userAName) ?? asString(parsed.partnerName);
      const b = asString(parsed.userBName);
      if (a && b) return `${a} ↔ ${b}`;
      if (a) return a;
      const id = asString(parsed.partnershipId);
      if (id) return `Partnership ${id}`;
    }

    if (
      action === "profile.notification_email_requested" ||
      action === "profile.notification_email_verified" ||
      action === "profile.notification_email_cleared"
    ) {
      const email = asString(parsed.email);
      if (email) return email;
    }

    if (action === "admin.force_reload") {
      const env = asString(parsed.environment);
      if (env) return `Environment: ${env}`;
    }

    const message = asString(parsed.message);
    if (message && !looksLikeJson(message)) return message;

    // Prefer named people/places over dumping the object.
    const fallbackName =
      asString(parsed.displayName) ??
      asString(parsed.placeName) ??
      asString(parsed.targetDisplayName) ??
      asString(parsed.username);
    if (fallbackName) return fallbackName;

    return formatActivityLogAction(action);
  } catch {
    if (looksLikeJson(details)) return formatActivityLogAction(action);
    return details;
  }
}
