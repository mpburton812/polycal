import { desc, isNotNull, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

import { requireAdminApiAccess } from "@/lib/alpha-feedback/admin-auth";
import {
  alphaFeedbackOptions,
  withAlphaFeedbackCors,
} from "@/lib/alpha-feedback/cors";
import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import { alphaFeedbackSubmissions } from "@/lib/db/schema";

export function OPTIONS(request: Request): NextResponse {
  return alphaFeedbackOptions(request);
}

/**
 * Lists alpha feedback submissions (metadata only; no screenshot bytes) (PC-121).
 * Query `?archived=1` returns the archive list; default is the active inbox (PC-136).
 */
export async function GET(request: Request): Promise<NextResponse> {
  const access = await requireAdminApiAccess(request);
  if (!access.ok) return withAlphaFeedbackCors(request, access.response);

  const url = new URL(request.url);
  const archivedOnly = url.searchParams.get("archived") === "1";

  await ensureDbReady();
  const db = getDb();
  const rows = await db
    .select({
      id: alphaFeedbackSubmissions.id,
      kind: alphaFeedbackSubmissions.kind,
      title: alphaFeedbackSubmissions.title,
      description: alphaFeedbackSubmissions.description,
      status: alphaFeedbackSubmissions.status,
      submitterUserId: alphaFeedbackSubmissions.submitterUserId,
      submitterDisplayName: alphaFeedbackSubmissions.submitterDisplayName,
      submittedAt: alphaFeedbackSubmissions.submittedAt,
      environment: alphaFeedbackSubmissions.environment,
      buildSha: alphaFeedbackSubmissions.buildSha,
      buildBranch: alphaFeedbackSubmissions.buildBranch,
      pagePath: alphaFeedbackSubmissions.pagePath,
      viewportWidth: alphaFeedbackSubmissions.viewportWidth,
      viewportHeight: alphaFeedbackSubmissions.viewportHeight,
      userAgent: alphaFeedbackSubmissions.userAgent,
      osLabel: alphaFeedbackSubmissions.osLabel,
      consoleLogTail: alphaFeedbackSubmissions.consoleLogTail,
      hasScreenshot: alphaFeedbackSubmissions.screenshotMimeType,
      screenshotMimeType: alphaFeedbackSubmissions.screenshotMimeType,
      internalComment: alphaFeedbackSubmissions.internalComment,
      submitterComment: alphaFeedbackSubmissions.submitterComment,
      archivedAt: alphaFeedbackSubmissions.archivedAt,
      createdAt: alphaFeedbackSubmissions.createdAt,
      updatedAt: alphaFeedbackSubmissions.updatedAt,
    })
    .from(alphaFeedbackSubmissions)
    .where(
      archivedOnly
        ? isNotNull(alphaFeedbackSubmissions.archivedAt)
        : isNull(alphaFeedbackSubmissions.archivedAt),
    )
    .orderBy(desc(alphaFeedbackSubmissions.submittedAt));

  return withAlphaFeedbackCors(
    request,
    NextResponse.json({
      submissions: rows.map((row) => ({
        ...row,
        hasScreenshot: Boolean(row.hasScreenshot),
      })),
      view: archivedOnly ? "archive" : "active",
    }),
  );
}
