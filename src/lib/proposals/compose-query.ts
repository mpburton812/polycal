import { LONG_TEXT_MAX, SHORT_TEXT_MAX } from "@/lib/validation/string-limits";

/** Title cap for `?compose=event&title=` (PC-476). */
export const COMPOSE_TITLE_MAX = SHORT_TEXT_MAX;

/** Description cap for NLP `q` / `description` (PC-476). */
export const COMPOSE_NLP_MAX = LONG_TEXT_MAX;

export const COMPOSE_QUERY_KEYS = ["compose", "title", "q", "description"] as const;

export type ComposeQueryIntent =
  | { compose: "event"; title: string }
  | { compose: "nlp"; nlpText: string };

/**
 * Strips control characters and caps length so widget/PWA query strings cannot bloat the composer.
 */
export function sanitizeComposeText(raw: string | null | undefined, max: number): string {
  if (!raw) return "";
  return raw.replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, max);
}

/**
 * Reads a deny-by-default compose intent from `/feed` (or any in-app) search params.
 * Unknown `compose` values and unexpected params are ignored.
 */
export function parseComposeQuery(
  searchParams: Pick<URLSearchParams, "get">,
): ComposeQueryIntent | null {
  const compose = searchParams.get("compose");
  if (compose !== "event" && compose !== "nlp") return null;
  if (compose === "event") {
    return {
      compose: "event",
      title: sanitizeComposeText(searchParams.get("title"), COMPOSE_TITLE_MAX),
    };
  }
  const nlpRaw = searchParams.get("q") ?? searchParams.get("description");
  return {
    compose: "nlp",
    nlpText: sanitizeComposeText(nlpRaw, COMPOSE_NLP_MAX),
  };
}

/**
 * Drops compose keys so a refresh or back does not re-open the dialog.
 * Other query params (if any) are preserved.
 */
export function stripComposeSearch(searchParams: URLSearchParams): string {
  const next = new URLSearchParams(searchParams.toString());
  for (const key of COMPOSE_QUERY_KEYS) {
    next.delete(key);
  }
  return next.toString();
}

/**
 * Builds the in-app compose path widgets and PWA shortcuts launch.
 */
export function buildComposePath(intent: ComposeQueryIntent): string {
  const params = new URLSearchParams();
  params.set("compose", intent.compose);
  if (intent.compose === "event" && intent.title) {
    params.set("title", intent.title);
  }
  if (intent.compose === "nlp" && intent.nlpText) {
    params.set("q", intent.nlpText);
  }
  return `/feed?${params.toString()}`;
}
