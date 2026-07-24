/**
 * Guards Google Calendar API / OAuth paths against admin impersonation (PC-344).
 */
import { auth } from "@/lib/auth";

export const IMPERSONATION_CALENDAR_BLOCKED_MESSAGE =
  "Calendar integration changes and Google Calendar API calls are disabled while impersonating another user.";

/** True when the current session was created via admin impersonation. */
export async function isImpersonatingSession(): Promise<boolean> {
  const session = await auth();
  return session?.user?.isImpersonating === true;
}

/**
 * Returns an error message when calendar Google/OAuth mutations must not run, otherwise null.
 */
export async function googleCalendarBlockedReason(): Promise<string | null> {
  if (await isImpersonatingSession()) {
    return IMPERSONATION_CALENDAR_BLOCKED_MESSAGE;
  }
  return null;
}
