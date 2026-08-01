import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminApiAccess } from "@/lib/alpha-feedback/admin-auth";
import {
  alphaFeedbackOptions,
  withAlphaFeedbackCors,
} from "@/lib/alpha-feedback/cors";
import { ALPHA_FEEDBACK_STATUS_LABELS } from "@/lib/alpha-feedback/schema";
import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import { alphaFeedbackSubmissions } from "@/lib/db/schema";
import { notifyUser } from "@/lib/notifications";

const notifySchema = z.object({
  /** Optional override; defaults to the stored submitter comment. */
  submitterComment: z.string().trim().max(4000).optional(),
});

export function OPTIONS(request: Request): NextResponse {
  return alphaFeedbackOptions(request);
}

/**
 * Notifies the submitter in-app with title, status, and submitter comment (PC-121).
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const access = await requireAdminApiAccess(request);
  if (!access.ok) return withAlphaFeedbackCors(request, access.response);

  const { id } = await context.params;
  if (!id || id.length > 80) {
    return withAlphaFeedbackCors(
      request,
      NextResponse.json({ error: "Not found" }, { status: 404 }),
    );
  }

  let body: unknown = {};
  try {
    const text = await request.text();
    if (text.trim()) body = JSON.parse(text);
  } catch {
    return withAlphaFeedbackCors(
      request,
      NextResponse.json({ error: "Invalid JSON." }, { status: 400 }),
    );
  }

  const parsed = notifySchema.safeParse(body);
  if (!parsed.success) {
    return withAlphaFeedbackCors(
      request,
      NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input." },
        { status: 400 },
      ),
    );
  }

  await ensureDbReady();
  const db = getDb();
  const [row] = await db
    .select()
    .from(alphaFeedbackSubmissions)
    .where(eq(alphaFeedbackSubmissions.id, id))
    .limit(1);

  if (!row) {
    return withAlphaFeedbackCors(
      request,
      NextResponse.json({ error: "Not found" }, { status: 404 }),
    );
  }

  // Prefer body override (SAVE flow), then draft field, then latest log entry (PC-184).
  let commentFromLog: string | undefined;
  try {
    const log = row.commentLog ? (JSON.parse(row.commentLog) as unknown) : [];
    if (Array.isArray(log)) {
      for (let i = log.length - 1; i >= 0; i -= 1) {
        const entry = log[i] as { submitterComment?: unknown };
        if (
          typeof entry?.submitterComment === "string" &&
          entry.submitterComment.trim()
        ) {
          commentFromLog = entry.submitterComment.trim();
          break;
        }
      }
    }
  } catch {
    commentFromLog = undefined;
  }

  const comment =
    parsed.data.submitterComment?.trim() ||
    row.submitterComment?.trim() ||
    commentFromLog ||
    "(no comment)";
  const statusLabel =
    ALPHA_FEEDBACK_STATUS_LABELS[
      row.status as keyof typeof ALPHA_FEEDBACK_STATUS_LABELS
    ] ?? row.status;

  const message = `Feedback update: "${row.title}" — ${statusLabel}. ${comment}`;

  // Do not re-write draft submitterComment — history lives in comment_log (PC-183/184).

  await notifyUser(row.submitterUserId, "alpha_feedback_reply", message, {
    url: "/schedule",
    feedbackId: row.id,
    feedbackTitle: row.title,
    feedbackStatus: row.status,
  });

  return withAlphaFeedbackCors(
    request,
    NextResponse.json({ ok: true, message: "Notification sent." }),
  );
}
