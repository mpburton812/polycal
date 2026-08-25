/** Max callback length so login redirects cannot smuggle an unbounded query. */
export const CALLBACK_URL_MAX_LENGTH = 2048;

const FALLBACK_CALLBACK = "/feed";

/**
 * Returns a same-origin relative path (pathname + search) for Auth.js `callbackUrl`.
 * Rejects protocol-relative URLs, backslashes, and absolute URLs to prevent open redirects.
 */
export function safeInternalCallbackPath(
  raw: string | null | undefined,
  fallback = FALLBACK_CALLBACK,
): string {
  if (!raw) return fallback;
  let value = raw.trim();
  if (!value || value.length > CALLBACK_URL_MAX_LENGTH) return fallback;

  // Older links may pass a still-encoded path; decoded values already start with "/".
  if (!value.startsWith("/") && /%2f/i.test(value)) {
    try {
      value = decodeURIComponent(value);
    } catch {
      return fallback;
    }
  }

  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return fallback;
  }
  if (value.includes("\\") || value.includes("://")) {
    return fallback;
  }
  if (/[\u0000-\u001F\u007F]/.test(value)) {
    return fallback;
  }
  return value;
}

/**
 * Builds the login callback from the request URL so compose query strings survive
 * unauthenticated TWA / PWA deep-links (PC-477).
 */
export function loginCallbackUrlFromRequest(url: { pathname: string; search: string }): string {
  return safeInternalCallbackPath(`${url.pathname}${url.search}`);
}
