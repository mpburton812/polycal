/**
 * Standard server-action success/failure shapes (PC-356).
 *
 * Prefer `message` on failures so action results align with {@link ActionContextError}
 * from `@/lib/actions/context` and admin/user action modules.
 */

/** Simple action with no payload on success. */
export type ActionResult = { ok: true } | { ok: false; message: string };

/** Failure branch for typed action results. */
export type ActionFailure = { ok: false; message: string };

/** Builds a normalized failure result. */
export function actionFail(message: string): ActionFailure {
  return { ok: false, message };
}
