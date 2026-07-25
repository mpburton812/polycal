"use server";

import { desc, eq, or } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";

import { logUserActivity } from "@/lib/audit";
import { requireSession, withDb } from "@/lib/actions/context";
import { proposals, sleepingPartnerships, users } from "@/lib/db/schema";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  buildAccountExport,
  buildAccountExportFilename,
  type AccountExport,
} from "@/lib/users/account-export";

export type ExportMyDataResult =
  | { ok: true; filename: string; data: AccountExport }
  | { ok: false; message: string };

/**
 * Returns the signed-in member's own data as a downloadable JSON document (PC-354).
 *
 * Scoped strictly to rows the member authored or is party to — group content owned by
 * others is out of scope, since PolyCal is a shared space and an export must not become a
 * bulk extraction tool for other members' schedules.
 */
export async function exportMyDataAction(): Promise<ExportMyDataResult> {
  const sessionResult = await requireSession();
  if (!sessionResult.ok) {
    return { ok: false, message: sessionResult.message };
  }

  // An impersonating admin must not be able to walk off with the target's data.
  if (sessionResult.user.isImpersonating) {
    return { ok: false, message: "Data export is unavailable while impersonating." };
  }

  if (!checkRateLimit(`account-export:${sessionResult.user.id}`, 5, 60_000)) {
    return { ok: false, message: "Too many export requests. Try again in a minute." };
  }

  const userId = sessionResult.user.id;

  return withDb(async (db) => {
    const [profile] = await db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        role: users.role,
        status: users.status,
        gender: users.gender,
        profileBio: users.profileBio,
        avatarKey: users.avatarKey,
        theme: users.theme,
        timezone: users.timezone,
        notificationEmail: users.notificationEmail,
        emailVerifiedAt: users.emailVerifiedAt,
        notificationPrefsJson: users.notificationPrefsJson,
        feedPrefsJson: users.feedPrefsJson,
        lastLoginAt: users.lastLoginAt,
        loginCount: users.loginCount,
        onboardingComplete: users.onboardingComplete,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!profile) {
      return { ok: false as const, message: "Account not found." };
    }

    const authoredProposals = await db
      .select({
        id: proposals.id,
        title: proposals.title,
        proposalType: proposals.proposalType,
        state: proposals.state,
        scheduledStartAt: proposals.scheduledStartAt,
        scheduledEndAt: proposals.scheduledEndAt,
        createdAt: proposals.createdAt,
      })
      .from(proposals)
      .where(eq(proposals.proposerId, userId))
      .orderBy(desc(proposals.createdAt));

    // Partnerships are undirected (low/high id pair), so join both sides and pick whichever
    // name is not the requester's.
    const lowUser = alias(users, "partnership_low_user");
    const highUser = alias(users, "partnership_high_user");
    const partnershipRows = await db
      .select({
        userLowId: sleepingPartnerships.userLowId,
        lowDisplayName: lowUser.displayName,
        highDisplayName: highUser.displayName,
        status: sleepingPartnerships.status,
        proposedById: sleepingPartnerships.proposedById,
        createdAt: sleepingPartnerships.createdAt,
        respondedAt: sleepingPartnerships.respondedAt,
      })
      .from(sleepingPartnerships)
      .innerJoin(lowUser, eq(sleepingPartnerships.userLowId, lowUser.id))
      .innerJoin(highUser, eq(sleepingPartnerships.userHighId, highUser.id))
      .where(
        or(
          eq(sleepingPartnerships.userLowId, userId),
          eq(sleepingPartnerships.userHighId, userId),
        ),
      )
      .orderBy(desc(sleepingPartnerships.createdAt));

    const generatedAt = new Date().toISOString();
    const data = buildAccountExport({
      generatedAt,
      profile,
      proposals: authoredProposals,
      partnerships: partnershipRows.map((row) => ({
        partnerDisplayName:
          row.userLowId === userId ? row.highDisplayName : row.lowDisplayName,
        status: row.status,
        proposedByYou: row.proposedById === userId,
        createdAt: row.createdAt,
        respondedAt: row.respondedAt,
      })),
    });

    await logUserActivity(userId, "account.data_export");

    return {
      ok: true as const,
      filename: buildAccountExportFilename(profile.username, generatedAt),
      data,
    };
  });
}
