/** Minimal read-only view of the headers available to server actions/routes. */
interface HeaderReader {
  get(name: string): string | null;
}

/**
 * Derives the caller's IP for rate-limit keys from proxy headers (PC-353).
 *
 * Vercel/Render terminate TLS in front of the app, so the socket address is the
 * proxy. `x-forwarded-for` is a client-controlled header in general, but behind
 * these platforms the edge rewrites the left-most entry, so the first hop is the
 * trustworthy one. Never accept an IP supplied in a request body — a caller
 * could rotate it freely and defeat the limiter.
 */
export function getClientIpFromHeaders(headerList: HeaderReader): string {
  const forwarded = headerList.get("x-forwarded-for");
  const firstHop = forwarded?.split(",")[0]?.trim();
  if (firstHop) return firstHop;

  const realIp = headerList.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  return "unknown";
}
