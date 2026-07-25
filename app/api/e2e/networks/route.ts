import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { hash } from "bcryptjs";

import { importResidencesAndPassiveSleeping } from "@/lib/networks/import-on-join";
import { isE2eApiAuthorized } from "@/lib/e2e-api";
import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import {
  locations,
  locationResidents,
  networkMembers,
  networks,
  sleepingPartnerships,
  users,
} from "@/lib/db/schema";
import {
  ensureOwnedPassivesInNetwork,
  removeMembership,
  upsertMembership,
} from "@/lib/networks/membership";

/**
 * E2E fixture helpers for multi-network journeys (PC-357 / J1–J5).
 * POST body: { op, ...params }
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (!isE2eApiAuthorized(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await ensureDbReady();
  const body = (await request.json()) as Record<string, unknown>;
  const op = String(body.op ?? "");
  const db = getDb();
  const now = new Date().toISOString();

  try {
    if (op === "create_network") {
      const name = String(body.name ?? "E2E Network");
      const adminUserId = String(body.adminUserId ?? "sw-luke");
      const networkId = randomUUID();
      await db.insert(networks).values({
        id: networkId,
        name,
        status: "active",
        createdByUserId: adminUserId,
        createdByEmail: "e2e@example.com",
        allowUserProvisioning: true,
        adminCanSeeUninvolved: true,
        auditLogVisibility: "admin_only",
        hideSleepingArrangements: false,
        placesMapVisibility: "all",
        logTailLength: 100,
        onboardingWelcomeMessage: "Welcome",
        proposedMaxDays: 0,
        atRiskTtlDays: 7,
        archiveGraceHours: 24,
        redraftDeadlineHours: 24,
        sleepingPartnerProposalMaxDays: 5,
        createdAt: now,
        updatedAt: now,
      });
      await upsertMembership({
        networkId,
        userId: adminUserId,
        role: "network_admin",
      });
      return NextResponse.json({ ok: true, networkId });
    }

    if (op === "add_member") {
      const networkId = String(body.networkId);
      const userId = String(body.userId);
      const role = (body.role as "network_admin" | "user" | "passive") ?? "user";
      await upsertMembership({ networkId, userId, role });
      return NextResponse.json({ ok: true });
    }

    if (op === "create_user") {
      const username = String(body.username).toLowerCase();
      const displayName = String(body.displayName ?? username);
      const networkId = String(body.networkId);
      const role = (body.role as "admin" | "user" | "passive") ?? "user";
      const ownedByUserId =
        typeof body.ownedByUserId === "string" ? body.ownedByUserId : null;
      const userId = role === "passive" ? `passive-${randomUUID()}` : `user-${randomUUID()}`;
      const passwordHash = await hash(String(body.password ?? "ChangeMe123!"), 10);
      await db.insert(users).values({
        id: userId,
        username,
        displayName,
        passwordHash,
        role,
        status: "active",
        mustChangePassword: false,
        onboardingComplete: true,
        theme: "mint",
        timezone: "UTC",
        ownedByUserId,
        createdAt: now,
        updatedAt: now,
      });
      await upsertMembership({
        networkId,
        userId,
        role: role === "admin" ? "network_admin" : role === "passive" ? "passive" : "user",
      });
      return NextResponse.json({ ok: true, userId });
    }

    if (op === "seed_residence_and_sleeping") {
      const networkId = String(body.networkId);
      const ownerId = String(body.ownerId);
      const passiveId = String(body.passiveId);
      const locationId = randomUUID();
      await db.insert(locations).values({
        id: locationId,
        networkId,
        name: String(body.placeName ?? "E2E Place"),
        bedroomCount: 1,
        bedroomNames: JSON.stringify(["Main"]),
        createdById: ownerId,
        createdAt: now,
        updatedAt: now,
      });
      for (const uid of [ownerId, passiveId]) {
        await db.insert(locationResidents).values({
          id: randomUUID(),
          locationId,
          userId: uid,
          status: "accepted",
          placeRole: uid === ownerId ? "owner" : "resident",
          proposedById: ownerId,
          createdAt: now,
          updatedAt: now,
          respondedAt: now,
        });
      }
      const [low, high] =
        ownerId < passiveId ? [ownerId, passiveId] : [passiveId, ownerId];
      await db.insert(sleepingPartnerships).values({
        id: randomUUID(),
        networkId,
        userLowId: low,
        userHighId: high,
        status: "accepted",
        proposedById: ownerId,
        createdAt: now,
        updatedAt: now,
        respondedAt: now,
        passiveAutoAccepted: true,
      });
      return NextResponse.json({ ok: true, locationId });
    }

    if (op === "join_with_import") {
      const userId = String(body.userId);
      const sourceNetworkId = String(body.sourceNetworkId);
      const destNetworkId = String(body.destNetworkId);
      await upsertMembership({ networkId: destNetworkId, userId, role: "user" });
      await ensureOwnedPassivesInNetwork(userId, destNetworkId);
      await importResidencesAndPassiveSleeping({
        userId,
        sourceNetworkId,
        destNetworkId,
        importResidences: true,
        importPassiveSleeping: true,
      });
      return NextResponse.json({ ok: true });
    }

    if (op === "scoped_remove") {
      const userId = String(body.userId);
      const networkId = String(body.networkId);
      const removed = await removeMembership(userId, networkId);
      return NextResponse.json({ ok: removed });
    }

    if (op === "platform_ban") {
      // Direct DB ban for e2e (avoids session requirement).
      const userId = String(body.userId);
      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!user) return NextResponse.json({ ok: false, error: "missing user" }, { status: 404 });
      await db
        .update(users)
        .set({
          status: "deleted",
          sessionVersion: (user.sessionVersion ?? 0) + 1,
          updatedAt: now,
        })
        .where(eq(users.id, userId));
      await db
        .update(networkMembers)
        .set({ status: "removed", updatedAt: now })
        .where(
          and(eq(networkMembers.userId, userId), eq(networkMembers.status, "active")),
        );
      return NextResponse.json({ ok: true });
    }

    if (op === "membership_status") {
      const userId = String(body.userId);
      const networkId = String(body.networkId);
      const [row] = await db
        .select()
        .from(networkMembers)
        .where(
          and(
            eq(networkMembers.userId, userId),
            eq(networkMembers.networkId, networkId),
          ),
        )
        .limit(1);
      return NextResponse.json({
        ok: true,
        status: row?.status ?? null,
        role: row?.role ?? null,
      });
    }

    if (op === "count_imported") {
      const networkId = String(body.networkId);
      const ownerId = String(body.ownerId);
      const locs = await db
        .select()
        .from(locations)
        .where(and(eq(locations.networkId, networkId), eq(locations.createdById, ownerId)));
      const parts = await db
        .select()
        .from(sleepingPartnerships)
        .where(eq(sleepingPartnerships.networkId, networkId));
      return NextResponse.json({
        ok: true,
        locationCount: locs.length,
        partnershipCount: parts.length,
      });
    }

    return NextResponse.json({ ok: false, error: `Unknown op ${op}` }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
