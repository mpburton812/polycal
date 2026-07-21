/**
 * Browser-safe Feed URL helpers (extract, normalize, linkify split, OG HTML parse) (PC-279).
 * Keep Node SSRF/fetch out of this module so client components can import it.
 */

export const LINK_PREVIEW_TITLE_MAX = 200;
export const LINK_PREVIEW_DESCRIPTION_MAX = 400;

const URL_IN_TEXT_RE =
  /\bhttps?:\/\/[^\s<>"'`)\]]+/gi;

export interface LinkPreviewMeta {
  normalizedUrl: string;
  canonicalUrl: string;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  siteName: string | null;
}

export interface FeedLinkPreviewView {
  id: string;
  url: string;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  siteName: string | null;
  status: "ok" | "failed";
}

function stripTrailingPunctuation(url: string): string {
  return url.replace(/[.,;:!?)\]}'"]+$/g, "");
}

/**
 * Finds all http(s) URLs in free text (trailing punctuation stripped).
 */
export function extractUrls(text: string): string[] {
  const matches = text.match(URL_IN_TEXT_RE) ?? [];
  const out: string[] = [];
  for (const raw of matches) {
    const cleaned = stripTrailingPunctuation(raw);
    if (cleaned) out.push(cleaned);
  }
  return out;
}

/**
 * Returns the first http(s) URL in text, or null.
 */
export function extractFirstUrl(text: string): string | null {
  return extractUrls(text)[0] ?? null;
}

/**
 * Normalizes a candidate URL for cache keys; returns null if scheme/host invalid.
 */
export function normalizeLinkUrl(raw: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  if (!parsed.hostname) return null;
  parsed.hash = "";
  if (parsed.protocol === "http:") {
    parsed.protocol = "https:";
  }
  return parsed.toString();
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num: string) => String.fromCharCode(Number(num)));
}

function metaContent(html: string, propertyOrName: string): string | null {
  const escaped = propertyOrName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["']`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["']`,
      "i",
    ),
  ];
  for (const re of patterns) {
    const match = html.match(re);
    if (match?.[1]) return decodeHtmlEntities(match[1].trim());
  }
  return null;
}

function clampText(value: string | null, max: number): string | null {
  if (!value) return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

/**
 * Parses Open Graph / basic meta tags from an HTML document string.
 */
export function parseOpenGraphHtml(html: string, pageUrl: string): LinkPreviewMeta {
  const title =
    clampText(metaContent(html, "og:title"), LINK_PREVIEW_TITLE_MAX) ??
    clampText(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? null, LINK_PREVIEW_TITLE_MAX);
  const description =
    clampText(metaContent(html, "og:description"), LINK_PREVIEW_DESCRIPTION_MAX) ??
    clampText(metaContent(html, "description"), LINK_PREVIEW_DESCRIPTION_MAX);
  const siteName = clampText(metaContent(html, "og:site_name"), LINK_PREVIEW_TITLE_MAX);
  let imageUrl = metaContent(html, "og:image");
  if (imageUrl) {
    try {
      const abs = new URL(imageUrl, pageUrl);
      imageUrl = abs.protocol === "https:" ? abs.toString() : null;
    } catch {
      imageUrl = null;
    }
  }
  let canonical = metaContent(html, "og:url") ?? pageUrl;
  try {
    canonical = new URL(canonical, pageUrl).toString();
  } catch {
    canonical = pageUrl;
  }
  const normalizedUrl = normalizeLinkUrl(pageUrl) ?? pageUrl;
  return {
    normalizedUrl,
    canonicalUrl: canonical,
    title,
    description,
    imageUrl,
    siteName,
  };
}

/**
 * Domain hostname for card chrome (e.g. example.com).
 */
export function displayDomainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return url;
  }
}

/**
 * Splits body text into plain segments and URL segments for linkify rendering.
 */
export function splitTextWithUrls(text: string): Array<{ type: "text" | "url"; value: string }> {
  const parts: Array<{ type: "text" | "url"; value: string }> = [];
  const re = new RegExp(URL_IN_TEXT_RE.source, "gi");
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const raw = match[0]!;
    const cleaned = stripTrailingPunctuation(raw);
    const start = match.index;
    if (start > lastIndex) {
      parts.push({ type: "text", value: text.slice(lastIndex, start) });
    }
    if (cleaned && normalizeLinkUrl(cleaned)) {
      parts.push({ type: "url", value: cleaned });
      const trailing = raw.slice(cleaned.length);
      if (trailing) parts.push({ type: "text", value: trailing });
    } else {
      parts.push({ type: "text", value: raw });
    }
    lastIndex = start + raw.length;
  }
  if (lastIndex < text.length) {
    parts.push({ type: "text", value: text.slice(lastIndex) });
  }
  return parts.length > 0 ? parts : [{ type: "text", value: text }];
}
