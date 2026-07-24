import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { syncProposalToExternalCalendars } from "@/lib/calendar/sync";
import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import { calendarIcsPending, proposals, users } from "@/lib/db/schema";
import { isE2eApiAuthorized } from "@/lib/e2e-api";

/**
 * Forces calendar sync for the latest proposal by title for a user — E2E only (PC-345).
 * Used after solo resolve so journeys can assert Download ICS even if the resolve-time
 * sync raced ahead of prefs (or prefs were seeded on a different worker origin).
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (!isE2eApiAuthorized(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { username?: string; title?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const username = body.username?.trim().toLowerCase();
  const title = body.title?.trim();
  if (!username || !title) {
    return NextResponse.json(
      { error: "username and title required." },
      { status: 400 },
    );
  }

  await ensureDbReady();
  const db = getDb();
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);
  if (!user) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const [proposal] = await db
    .select({ id: proposals.id, state: proposals.state })
    .from(proposals)
    .where(and(eq(proposals.proposerId, user.id), eq(proposals.title, title)))
    .orderBy(desc(proposals.createdAt))
    .limit(1);

  if (!proposal) {
    return NextResponse.json({ error: "Proposal not found." }, { status: 404 });
  }

  await syncProposalToExternalCalendars(proposal.id, "upsert");

  const [pending] = await db
    .select({ id: calendarIcsPending.id })
    .from(calendarIcsPending)
    .where(
      and(
        eq(calendarIcsPending.userId, user.id),
        eq(calendarIcsPending.proposalId, proposal.id),
      ),
    )
    .orderBy(desc(calendarIcsPending.createdAt))
    .limit(1);

  return NextResponse.json({
    ok: true,
    proposalId: proposal.id,
    state: proposal.state,
    pendingId: pending?.id ?? null,
  });
}
