import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { requireAdminApiAccess } from "@/lib/alpha-feedback/admin-auth";
import {
  alphaFeedbackOptions,
  withAlphaFeedbackCors,
} from "@/lib/alpha-feedback/cors";
import {
  ALPHA_FEEDBACK_STATUS_LABELS,
  alphaFeedbackPatchSchema,
} from "@/lib/alpha-feedback/schema";
import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import { alphaFeedbackSubmissions } from "@/lib/db/schema";

export function OPTIONS(request: Request): NextResponse {
  return alphaFeedbackOptions(request);
}

/**
 * Returns one submission including base64 screenshot when present (PC-121).
 */
export async function GET(
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

  return withAlphaFeedbackCors(
    request,
    NextResponse.json({
      submission: {
        ...row,
        screenshotData: undefined,
        screenshotBase64: row.screenshotData
          ? Buffer.from(row.screenshotData).toString("base64")
          : null,
        statusLabel:
          ALPHA_FEEDBACK_STATUS_LABELS[
            row.status as keyof typeof ALPHA_FEEDBACK_STATUS_LABELS
          ] ?? row.status,
      },
    }),
  );
}

/**
 * Updates status and comments on a submission (PC-121).
 */
export async function PATCH(
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return withAlphaFeedbackCors(
      request,
      NextResponse.json({ error: "Invalid JSON." }, { status: 400 }),
    );
  }

  const parsed = alphaFeedbackPatchSchema.safeParse(body);
  if (!parsed.success) {
    return withAlphaFeedbackCors(
      request,
      NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input." },
        { status: 400 },
      ),
    );
  }

  if (
    parsed.data.status === undefined &&
    parsed.data.internalComment === undefined &&
    parsed.data.submitterComment === undefined
  ) {
    return withAlphaFeedbackCors(
      request,
      NextResponse.json({ error: "No changes provided." }, { status: 400 }),
    );
  }

  await ensureDbReady();
  const db = getDb();
  const [existing] = await db
    .select({ id: alphaFeedbackSubmissions.id })
    .from(alphaFeedbackSubmissions)
    .where(eq(alphaFeedbackSubmissions.id, id))
    .limit(1);

  if (!existing) {
    return withAlphaFeedbackCors(
      request,
      NextResponse.json({ error: "Not found" }, { status: 404 }),
    );
  }

  const now = new Date().toISOString();
  await db
    .update(alphaFeedbackSubmissions)
    .set({
      ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
      ...(parsed.data.internalComment !== undefined
        ? { internalComment: parsed.data.internalComment }
        : {}),
      ...(parsed.data.submitterComment !== undefined
        ? { submitterComment: parsed.data.submitterComment }
        : {}),
      updatedAt: now,
    })
    .where(eq(alphaFeedbackSubmissions.id, id));

  const [updated] = await db
    .select({
      id: alphaFeedbackSubmissions.id,
      status: alphaFeedbackSubmissions.status,
      internalComment: alphaFeedbackSubmissions.internalComment,
      submitterComment: alphaFeedbackSubmissions.submitterComment,
      updatedAt: alphaFeedbackSubmissions.updatedAt,
    })
    .from(alphaFeedbackSubmissions)
    .where(eq(alphaFeedbackSubmissions.id, id))
    .limit(1);

  return withAlphaFeedbackCors(
    request,
    NextResponse.json({ submission: updated }),
  );
}
