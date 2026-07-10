import { desc } from "drizzle-orm";
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
 */
export async function GET(request: Request): Promise<NextResponse> {
  const access = await requireAdminApiAccess(request);
  if (!access.ok) return withAlphaFeedbackCors(request, access.response);

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
      createdAt: alphaFeedbackSubmissions.createdAt,
      updatedAt: alphaFeedbackSubmissions.updatedAt,
    })
    .from(alphaFeedbackSubmissions)
    .orderBy(desc(alphaFeedbackSubmissions.submittedAt));

  return withAlphaFeedbackCors(
    request,
    NextResponse.json({
      submissions: rows.map((row) => ({
        ...row,
        hasScreenshot: Boolean(row.hasScreenshot),
      })),
    }),
  );
}
