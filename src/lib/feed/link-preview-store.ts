/**
 * Persists and reuses feed link-preview cache rows (PC-279).
 */

import { eq } from "drizzle-orm";
import type { getDb } from "@/lib/db/client";
import { feedLinkPreviews } from "@/lib/db/schema";
import {
  LINK_PREVIEW_CACHE_TTL_MS,
  fetchLinkPreviewMeta,
  newLinkPreviewId,
  normalizeLinkUrl,
  type FeedLinkPreviewView,
} from "@/lib/feed/link-preview";

type Db = ReturnType<typeof getDb>;

function rowToView(row: {
  id: string;
  canonicalUrl: string;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  siteName: string | null;
  status: string;
}): FeedLinkPreviewView {
  return {
    id: row.id,
    url: row.canonicalUrl,
    title: row.title,
    description: row.description,
    imageUrl: row.imageUrl,
    siteName: row.siteName,
    status: row.status === "ok" ? "ok" : "failed",
  };
}

/**
 * Ensures a cached preview exists for the URL; returns the view or null on hard failure.
 */
export async function ensureLinkPreview(
  db: Db,
  rawUrl: string,
): Promise<FeedLinkPreviewView | null> {
  const normalized = normalizeLinkUrl(rawUrl);
  if (!normalized) return null;

  const [existing] = await db
    .select()
    .from(feedLinkPreviews)
    .where(eq(feedLinkPreviews.normalizedUrl, normalized))
    .limit(1);

  const now = Date.now();
  if (existing) {
    const age = now - Date.parse(existing.fetchedAt);
    if (
      existing.status === "ok" &&
      Number.isFinite(age) &&
      age < LINK_PREVIEW_CACHE_TTL_MS
    ) {
      return rowToView(existing);
    }
    // Refresh stale or previously failed entries.
  }

  try {
    const meta = await fetchLinkPreviewMeta(normalized);
    const fetchedAt = new Date().toISOString();
    if (existing) {
      await db
        .update(feedLinkPreviews)
        .set({
          canonicalUrl: meta.canonicalUrl,
          title: meta.title,
          description: meta.description,
          imageUrl: meta.imageUrl,
          siteName: meta.siteName,
          status: "ok",
          fetchedAt,
          errorCode: null,
        })
        .where(eq(feedLinkPreviews.id, existing.id));
      return rowToView({
        id: existing.id,
        canonicalUrl: meta.canonicalUrl,
        title: meta.title,
        description: meta.description,
        imageUrl: meta.imageUrl,
        siteName: meta.siteName,
        status: "ok",
      });
    }

    const id = newLinkPreviewId();
    await db.insert(feedLinkPreviews).values({
      id,
      normalizedUrl: normalized,
      canonicalUrl: meta.canonicalUrl,
      title: meta.title,
      description: meta.description,
      imageUrl: meta.imageUrl,
      siteName: meta.siteName,
      status: "ok",
      fetchedAt,
      errorCode: null,
    });
    return rowToView({
      id,
      canonicalUrl: meta.canonicalUrl,
      title: meta.title,
      description: meta.description,
      imageUrl: meta.imageUrl,
      siteName: meta.siteName,
      status: "ok",
    });
  } catch (error) {
    const errorCode = error instanceof Error ? error.message.slice(0, 64) : "fetch_failed";
    const fetchedAt = new Date().toISOString();
    if (existing) {
      await db
        .update(feedLinkPreviews)
        .set({
          status: "failed",
          fetchedAt,
          errorCode,
        })
        .where(eq(feedLinkPreviews.id, existing.id));
      return null;
    }
    const id = newLinkPreviewId();
    await db.insert(feedLinkPreviews).values({
      id,
      normalizedUrl: normalized,
      canonicalUrl: normalized,
      title: null,
      description: null,
      imageUrl: null,
      siteName: null,
      status: "failed",
      fetchedAt,
      errorCode,
    });
    return null;
  }
}

/**
 * Loads preview views by id for feed DTO assembly.
 */
export async function loadLinkPreviewsById(
  db: Db,
  ids: string[],
): Promise<Map<string, FeedLinkPreviewView>> {
  const result = new Map<string, FeedLinkPreviewView>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return result;

  const { inArray } = await import("drizzle-orm");
  const rows = await db
    .select()
    .from(feedLinkPreviews)
    .where(inArray(feedLinkPreviews.id, unique));

  for (const row of rows) {
    if (row.status === "ok") {
      result.set(row.id, rowToView(row));
    }
  }
  return result;
}

/**
 * Resolves a preview for the first URL in body text (if any).
 */
export async function resolvePreviewForBody(
  db: Db,
  body: string,
): Promise<{ linkPreviewId: string | null; linkPreview: FeedLinkPreviewView | null }> {
  const { extractFirstUrl } = await import("@/lib/feed/link-preview");
  const first = extractFirstUrl(body);
  if (!first) return { linkPreviewId: null, linkPreview: null };
  const preview = await ensureLinkPreview(db, first);
  return {
    linkPreviewId: preview?.id ?? null,
    linkPreview: preview,
  };
}
