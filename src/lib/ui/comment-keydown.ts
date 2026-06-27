import type { KeyboardEvent } from "react";

/**
 * Standard comment field keyboard: Enter posts, Shift+Enter inserts newline (PC-56).
 */
export function handleCommentEnterKey(
  event: KeyboardEvent<HTMLDivElement | HTMLTextAreaElement>,
  onPost: () => void,
  canPost: boolean,
): void {
  if (event.key !== "Enter" || event.shiftKey) return;
  event.preventDefault();
  if (!canPost) return;
  onPost();
}
