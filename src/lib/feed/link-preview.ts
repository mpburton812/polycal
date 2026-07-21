/**
 * Server-side Feed link-preview unfurl with SSRF defenses (PC-279).
 */

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { randomUUID } from "node:crypto";

import {
  normalizeLinkUrl,
  parseOpenGraphHtml,
  type LinkPreviewMeta,
} from "@/lib/feed/link-preview-core";

export {
  extractFirstUrl,
  extractUrls,
  normalizeLinkUrl,
  parseOpenGraphHtml,
  displayDomainFromUrl,
  splitTextWithUrls,
  LINK_PREVIEW_TITLE_MAX,
  LINK_PREVIEW_DESCRIPTION_MAX,
  type LinkPreviewMeta,
  type FeedLinkPreviewView,
} from "@/lib/feed/link-preview-core";

export const LINK_PREVIEW_FETCH_TIMEOUT_MS = 5_000;
export const LINK_PREVIEW_MAX_BYTES = 512_000;
export const LINK_PREVIEW_MAX_REDIRECTS = 3;
/** Reuse successful cache entries for this many ms. */
export const LINK_PREVIEW_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * True when an IPv4/IPv6 address is private, loopback, link-local, or metadata-like.
 */
export function isBlockedIpAddress(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) {
    const parts = ip.split(".").map((p) => Number(p));
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
    const [a, b] = parts as [number, number, number, number];
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
    return false;
  }
  if (version === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower === "::") return true;
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
    if (lower.startsWith("fe80")) return true;
    if (lower.startsWith("ff")) return true;
    if (lower.includes(".")) {
      const mapped = lower.split(":").pop();
      if (mapped && isIP(mapped) === 4) return isBlockedIpAddress(mapped);
    }
    return false;
  }
  return true;
}

/**
 * Resolves hostname and rejects blocked / private targets (SSRF).
 */
export async function assertUrlSafeToFetch(urlString: string): Promise<URL> {
  const url = new URL(urlString);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("unsupported_scheme");
  }
  const host = url.hostname;
  if (!host || host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("blocked_host");
  }
  if (isIP(host)) {
    if (isBlockedIpAddress(host)) throw new Error("blocked_ip");
    return url;
  }
  const records = await lookup(host, { all: true, verbatim: true });
  if (records.length === 0) throw new Error("dns_failed");
  for (const record of records) {
    if (isBlockedIpAddress(record.address)) throw new Error("blocked_ip");
  }
  return url;
}

type FetchLike = typeof fetch;

/**
 * Fetches a URL with redirect/SSRF limits and returns parsed OG metadata.
 */
export async function fetchLinkPreviewMeta(
  rawUrl: string,
  options?: { fetchImpl?: FetchLike },
): Promise<LinkPreviewMeta> {
  const normalized = normalizeLinkUrl(rawUrl);
  if (!normalized) throw new Error("invalid_url");

  // Deterministic preview for Playwright without outbound network (PC-279).
  if (process.env.E2E_TEST_MODE === "1") {
    const host = new URL(normalized).hostname;
    if (host === "link-preview.test" || host.endsWith(".link-preview.test")) {
      return {
        normalizedUrl: normalized,
        canonicalUrl: normalized,
        title: "E2E Link Preview Title",
        description: "Deterministic Open Graph description for Playwright.",
        imageUrl: null,
        siteName: "Link Preview Test",
      };
    }
  }

  const fetchImpl = options?.fetchImpl ?? fetch;
  let current = normalized;

  for (let hop = 0; hop <= LINK_PREVIEW_MAX_REDIRECTS; hop += 1) {
    await assertUrlSafeToFetch(current);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LINK_PREVIEW_FETCH_TIMEOUT_MS);
    try {
      const response = await fetchImpl(current, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
          "User-Agent": "PolyCalLinkPreview/1.0",
        },
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) throw new Error("bad_redirect");
        current = new URL(location, current).toString();
        if (!normalizeLinkUrl(current)) throw new Error("bad_redirect");
        continue;
      }

      if (!response.ok) throw new Error(`http_${response.status}`);
      const contentType = response.headers.get("content-type") ?? "";
      if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) {
        throw new Error("not_html");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("empty_body");
      const chunks: Uint8Array[] = [];
      let total = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          total += value.byteLength;
          if (total > LINK_PREVIEW_MAX_BYTES) {
            await reader.cancel();
            throw new Error("too_large");
          }
          chunks.push(value);
        }
      }
      const html = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8");
      return parseOpenGraphHtml(html, current);
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error("too_many_redirects");
}

/** Builds a stable id for a new preview row. */
export function newLinkPreviewId(): string {
  return randomUUID();
}
