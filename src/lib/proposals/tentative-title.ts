/**
 * Display helpers for the soft Tentative flag (PC-494).
 */

const TENT_PREFIX_RE = /^Tent:\s*/i;

/**
 * Prefixes a proposal title with `Tent:` when the tentative flag is set.
 * Idempotent if the title already starts with the prefix.
 */
export function formatTentativeTitle(title: string, tentative: boolean): string {
  const trimmed = title.trim();
  if (!tentative) return trimmed;
  if (TENT_PREFIX_RE.test(trimmed)) return trimmed;
  return `Tent: ${trimmed}`;
}

/**
 * Yellow diagonal hatch for tentative schedule blocks (PC-494).
 */
export const TENTATIVE_HATCH_BACKGROUND =
  "repeating-linear-gradient(-45deg, transparent, transparent 5px, rgba(212,160,23,0.28) 5px, rgba(212,160,23,0.28) 10px)";
