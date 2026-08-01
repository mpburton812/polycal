"use server";

import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import {
  alphaFeedbackSubmitSchema,
  decodeScreenshotPayload,
  type AlphaFeedbackSubmitInput,
} from "@/lib/alpha-feedback/schema";
import { requireSession, withDb } from "@/lib/actions/context";
import { alphaFeedbackSubmissions, users } from "@/lib/db/schema";
import { getBuildInfo } from "@/lib/env";

export interface SubmitAlphaFeedbackResult {
  ok: boolean;
  message: string;
  id?: string;
}

/**
 * Persists an alpha tester bug/feature submission with silent diagnostics (PC-120).
 */
export async function submitAlphaFeedbackAction(
  input: AlphaFeedbackSubmitInput,
): Promise<SubmitAlphaFeedbackResult> {
  const sessionResult = await requireSession();
  if (!sessionResult.ok) {
    return { ok: false, message: sessionResult.message };
  }

  const parsed = alphaFeedbackSubmitSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const screenshot = decodeScreenshotPayload(
    parsed.data.screenshotBase64,
    parsed.data.screenshotMimeType,
  );

  const build = getBuildInfo();
  const now = new Date().toISOString();
  const id = `afb-${randomUUID()}`;

  return withDb(async (db) => {
    const [userRow] = await db
      .select({ displayName: users.displayName })
      .from(users)
      .where(eq(users.id, sessionResult.user.id))
      .limit(1);

    // Next permanent human-visible id (#N); max+1 is fine at alpha feedback volume (PC-222).
    const [maxRow] = await db
      .select({
        maxTicket: sql<number | null>`max(${alphaFeedbackSubmissions.ticketNumber})`,
      })
      .from(alphaFeedbackSubmissions);
    const ticketNumber = (Number(maxRow?.maxTicket) || 0) + 1;

    await db.insert(alphaFeedbackSubmissions).values({
      id,
      kind: parsed.data.kind,
      title: parsed.data.title,
      description: parsed.data.description,
      status: "not_started",
      ticketNumber,
      submitterUserId: sessionResult.user.id,
      submitterDisplayName: userRow?.displayName ?? "User",
      submittedAt: now,
      environment: build.environment,
      buildSha: build.sha,
      buildBranch: build.branch,
      pagePath: parsed.data.pagePath ?? null,
      viewportWidth: parsed.data.viewportWidth ?? null,
      viewportHeight: parsed.data.viewportHeight ?? null,
      userAgent: parsed.data.userAgent ?? null,
      osLabel: parsed.data.osLabel ?? null,
      consoleLogTail: parsed.data.consoleLogTail
        ? JSON.stringify(parsed.data.consoleLogTail)
        : null,
      screenshotMimeType: screenshot?.mimeType ?? null,
      screenshotData: screenshot?.data ?? null,
      internalComment: null,
      submitterComment: null,
      createdAt: now,
      updatedAt: now,
    });

    revalidatePath("/admin");
    return { ok: true, message: "Success — thank you for your feedback.", id };
  });
}
