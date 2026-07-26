"use server";

import { and, eq, gte, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { z } from "zod";

import { hashLinkToken } from "@/lib/crypto/token-hash";
import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import {
  networkMembers,
  networkSetupTokens,
  networks,
  platformSettings,
  users,
} from "@/lib/db/schema";
import { sendEmail } from "@/lib/email/send";
import { getPublicAppUrl } from "@/lib/env";
import { logUserActivity } from "@/lib/audit";
import {
  ensureOwnedPassivesInNetwork,
  listActiveMemberships,
  removeAllMemberships,
  removeMembership,
  upsertMembership,
} from "@/lib/networks/membership";
import { importResidencesAndPassiveSleeping } from "@/lib/networks/import-on-join";
import {
  requireNetworkAdmin,
  requirePlatformAdmin,
} from "@/lib/networks/context";
import { requireSession } from "@/lib/actions/context";
import {
  DEFAULT_PLATFORM_SETTINGS,
  type PlatformSettings,
} from "@/types/network";
import { DEFAULT_ONBOARDING_WELCOME_MESSAGE } from "@/types/poly-group";
import { auth } from "@/lib/auth";

const SETUP_TOKEN_TTL_MS = 15 * 60 * 1000;

function newSetupToken(): string {
  return `ns-${randomUUID()}`;
}

async function loadPlatformSettings(): Promise<PlatformSettings> {
  const db = getDb();
  const [row] = await db.select().from(platformSettings).where(eq(platformSettings.id, 1)).limit(1);
  if (!row) return DEFAULT_PLATFORM_SETTINGS;
  return {
    maxNetworksPerEmail: row.maxNetworksPerEmail,
    maxNetworkCreatesPerDay: row.maxNetworkCreatesPerDay,
  };
}

/**
 * Counts networks created today (UTC day) for the global daily cap (PC-360).
 */
async function countNetworksCreatedToday(): Promise<number> {
  const db = getDb();
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(networks)
    .where(gte(networks.createdAt, start.toISOString()));
  return Number(row?.count ?? 0);
}

/**
 * Counts networks where created_by_email matches (per-email cap) (PC-360).
 */
async function countNetworksForEmail(email: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(networks)
    .where(eq(networks.createdByEmail, email.trim().toLowerCase()));
  return Number(row?.count ?? 0);
}

export async function getPlatformSettingsAction(): Promise<PlatformSettings> {
  await ensureDbReady();
  return loadPlatformSettings();
}

export async function updatePlatformSettingsAction(input: {
  maxNetworksPerEmail: number;
  maxNetworkCreatesPerDay: number;
}): Promise<{ ok: boolean; message: string }> {
  const admin = await requirePlatformAdmin();
  if (!admin.ok) return { ok: false, message: admin.message };
  const maxNetworksPerEmail = Math.max(1, Math.min(100, Math.floor(input.maxNetworksPerEmail)));
  const maxNetworkCreatesPerDay = Math.max(
    1,
    Math.min(1000, Math.floor(input.maxNetworkCreatesPerDay)),
  );
  await ensureDbReady();
  const db = getDb();
  const now = new Date().toISOString();
  await db
    .insert(platformSettings)
    .values({
      id: 1,
      maxNetworksPerEmail,
      maxNetworkCreatesPerDay,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: platformSettings.id,
      set: { maxNetworksPerEmail, maxNetworkCreatesPerDay, updatedAt: now },
    });
  return { ok: true, message: "Platform settings updated." };
}

/**
 * Starts self-serve network creation: email a single-use setup link (PC-360).
 */
export async function requestNetworkSetupLinkAction(
  emailRaw: string,
): Promise<{ ok: boolean; message: string; setupUrl?: string }> {
  const email = emailRaw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, message: "Enter a valid email address." };
  }

  await ensureDbReady();
  const settings = await loadPlatformSettings();
  const [forEmail, today] = await Promise.all([
    countNetworksForEmail(email),
    countNetworksCreatedToday(),
  ]);
  if (forEmail >= settings.maxNetworksPerEmail) {
    return {
      ok: false,
      message: `This email has reached the maximum of ${settings.maxNetworksPerEmail} networks.`,
    };
  }
  if (today >= settings.maxNetworkCreatesPerDay) {
    return {
      ok: false,
      message: "Daily network creation limit reached. Try again tomorrow.",
    };
  }

  const token = newSetupToken();
  const digest = hashLinkToken(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SETUP_TOKEN_TTL_MS).toISOString();
  const db = getDb();
  await db.insert(networkSetupTokens).values({
    id: randomUUID(),
    email,
    tokenDigest: digest,
    expiresAt,
    createdAt: now.toISOString(),
  });

  const setupUrl = `${getPublicAppUrl()}/setup-network?token=${encodeURIComponent(token)}`;
  const sent = await sendEmail({
    to: email,
    subject: "Create your PolyCal network",
    html: `<p>Use this link within 15 minutes to set up your network:</p><p><a href="${setupUrl}">${setupUrl}</a></p>`,
    text: `Set up your PolyCal network (15 minutes): ${setupUrl}`,
  });

  return {
    ok: true,
    message: sent.sent
      ? "Check your email for the setup link."
      : "Setup link ready (email not configured — use the returned URL).",
    setupUrl: sent.sent ? undefined : setupUrl,
  };
}

export async function validateNetworkSetupTokenAction(
  token: string,
): Promise<{ ok: boolean; message: string; email?: string }> {
  await ensureDbReady();
  const digest = hashLinkToken(token);
  const db = getDb();
  const [row] = await db
    .select()
    .from(networkSetupTokens)
    .where(eq(networkSetupTokens.tokenDigest, digest))
    .limit(1);
  if (!row || row.consumedAt) {
    return { ok: false, message: "Invalid or already used setup link." };
  }
  if (new Date(row.expiresAt).getTime() < Date.now()) {
    return { ok: false, message: "This setup link has expired." };
  }
  return { ok: true, message: "OK", email: row.email };
}

const wizardSchema = z.object({
  token: z.string().min(1),
  networkName: z.string().min(1).max(80),
  allowUserProvisioning: z.boolean().optional(),
  adminCanSeeUninvolved: z.boolean().optional(),
  inviteEmails: z
    .array(
      z.object({
        email: z.string().email(),
        role: z.enum(["network_admin", "user"]),
      }),
    )
    .max(5)
    .optional(),
  importFromNetworkId: z.string().optional(),
  importResidences: z.boolean().optional(),
  importPassiveSleeping: z.boolean().optional(),
});

/**
 * Completes network setup: creates network, assigns creator as network_admin,
 * invites, optional import, and consumes the setup token (PC-360).
 */
export async function completeNetworkSetupAction(
  raw: z.infer<typeof wizardSchema>,
): Promise<{ ok: boolean; message: string; networkId?: string }> {
  const parsed = wizardSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const input = parsed.data;
  await ensureDbReady();
  const db = getDb();
  const digest = hashLinkToken(input.token);
  const [tokenRow] = await db
    .select()
    .from(networkSetupTokens)
    .where(eq(networkSetupTokens.tokenDigest, digest))
    .limit(1);
  if (!tokenRow || tokenRow.consumedAt) {
    return { ok: false, message: "Invalid or already used setup link." };
  }
  if (new Date(tokenRow.expiresAt).getTime() < Date.now()) {
    return { ok: false, message: "This setup link has expired." };
  }

  const settings = await loadPlatformSettings();
  const email = tokenRow.email.toLowerCase();
  if ((await countNetworksForEmail(email)) >= settings.maxNetworksPerEmail) {
    return { ok: false, message: "Email network limit reached." };
  }
  if ((await countNetworksCreatedToday()) >= settings.maxNetworkCreatesPerDay) {
    return { ok: false, message: "Daily network creation limit reached." };
  }

  const session = await auth();
  let creatorId = session?.user?.id;
  if (!creatorId) {
    // Create a provisional platform user from email if not signed in.
    const usernameBase = email.split("@")[0].replace(/[^a-zA-Z0-9]/g, "").slice(0, 20) || "user";
    const username = `${usernameBase}${randomUUID().slice(0, 6)}`.toLowerCase();
    creatorId = randomUUID();
    const now = new Date().toISOString();
    const { hash } = await import("bcryptjs");
    const passwordHash = await hash(randomUUID() + "A1!", 10);
    await db.insert(users).values({
      id: creatorId,
      username,
      displayName: usernameBase,
      passwordHash,
      role: "admin",
      status: "active",
      mustChangePassword: true,
      onboardingComplete: false,
      theme: "mint",
      timezone: "UTC",
      createdAt: now,
      updatedAt: now,
      notificationEmail: email,
    });
  }

  const now = new Date().toISOString();
  const networkId = randomUUID();
  await db.insert(networks).values({
    id: networkId,
    name: input.networkName.trim(),
    status: "active",
    createdByUserId: creatorId,
    createdByEmail: email,
    allowUserProvisioning: input.allowUserProvisioning ?? false,
    adminCanSeeUninvolved: input.adminCanSeeUninvolved ?? true,
    auditLogVisibility: "admin_only",
    hideSleepingArrangements: false,
    placesMapVisibility: "all",
    logTailLength: 100,
    onboardingWelcomeMessage: DEFAULT_ONBOARDING_WELCOME_MESSAGE,
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
    userId: creatorId,
    role: "network_admin",
  });
  await ensureOwnedPassivesInNetwork(creatorId, networkId);

  if (
    input.importFromNetworkId &&
    (input.importResidences || input.importPassiveSleeping)
  ) {
    await importResidencesAndPassiveSleeping({
      userId: creatorId,
      sourceNetworkId: input.importFromNetworkId,
      destNetworkId: networkId,
      importResidences: input.importResidences === true,
      importPassiveSleeping: input.importPassiveSleeping === true,
    });
  }

  await db
    .update(networkSetupTokens)
    .set({ consumedAt: now, createdNetworkId: networkId })
    .where(eq(networkSetupTokens.id, tokenRow.id));

  await logUserActivity(
    creatorId,
    "networks.create",
    JSON.stringify({ networkId, name: input.networkName }),
  );

  return {
    ok: true,
    message: `Created network ${input.networkName}.`,
    networkId,
  };
}

/**
 * Lists networks the signed-in user belongs to (PC-359).
 */
export async function listMyNetworksAction(): Promise<
  { networkId: string; name: string; role: string; status: string }[]
> {
  const session = await requireSession();
  if (!session.ok) return [];
  await ensureDbReady();
  const memberships = await listActiveMemberships(session.user.id);
  return memberships.map((m) => ({
    networkId: m.networkId,
    name: m.networkName,
    role: m.role,
    status: m.networkStatus,
  }));
}

export async function switchActiveNetworkAction(
  networkId: string,
): Promise<{ ok: boolean; message: string }> {
  const session = await requireSession();
  if (!session.ok) return { ok: false, message: session.message };
  await ensureDbReady();
  const membership = (await listActiveMemberships(session.user.id)).find(
    (m) => m.networkId === networkId,
  );
  if (!membership) {
    return { ok: false, message: "You are not a member of that network." };
  }
  if (
    membership.networkStatus === "paused" &&
    membership.role !== "network_admin"
  ) {
    return { ok: false, message: "That network is paused." };
  }
  return { ok: true, message: "Switched.", /* client calls session.update */ };
}

/**
 * Join an existing network (invite accept path) with optional import (PC-361).
 */
export async function joinNetworkAction(input: {
  networkId: string;
  importFromNetworkId?: string;
  importResidences?: boolean;
  importPassiveSleeping?: boolean;
}): Promise<{ ok: boolean; message: string }> {
  const session = await requireSession();
  if (!session.ok) return { ok: false, message: session.message };
  await ensureDbReady();
  const db = getDb();
  const [network] = await db
    .select()
    .from(networks)
    .where(eq(networks.id, input.networkId))
    .limit(1);
  if (!network || network.status !== "active") {
    return { ok: false, message: "Network not found or paused." };
  }
  await upsertMembership({
    networkId: input.networkId,
    userId: session.user.id,
    role: "user",
  });
  await ensureOwnedPassivesInNetwork(session.user.id, input.networkId);
  if (
    input.importFromNetworkId &&
    (input.importResidences || input.importPassiveSleeping)
  ) {
    await importResidencesAndPassiveSleeping({
      userId: session.user.id,
      sourceNetworkId: input.importFromNetworkId,
      destNetworkId: input.networkId,
      importResidences: input.importResidences === true,
      importPassiveSleeping: input.importPassiveSleeping === true,
    });
  }
  return { ok: true, message: `Joined ${network.name}.` };
}

/**
 * Network-scoped membership removal — user remains in other networks (PC-362).
 */
export async function removeUserFromActiveNetworkAction(
  userId: string,
): Promise<{ ok: boolean; message: string }> {
  const admin = await requireNetworkAdmin();
  if (!admin.ok) return { ok: false, message: admin.message };
  if (userId === admin.user.id) {
    return { ok: false, message: "You cannot remove yourself." };
  }
  await ensureDbReady();
  const removed = await removeMembership(userId, admin.user.activeNetworkId);
  if (!removed) {
    return { ok: false, message: "User is not a member of this network." };
  }
  await logUserActivity(
    admin.user.id,
    "networks.member_remove",
    JSON.stringify({ userId, networkId: admin.user.activeNetworkId }),
  );
  return { ok: true, message: "Removed from this network." };
}

/**
 * Platform-wide ban: soft-delete user + strip all memberships (PC-362).
 */
export async function banUserFromAllNetworksAction(
  userId: string,
): Promise<{ ok: boolean; message: string }> {
  const admin = await requirePlatformAdmin();
  if (!admin.ok) return { ok: false, message: admin.message };
  if (userId === admin.user.id) {
    return { ok: false, message: "You cannot ban yourself." };
  }
  await ensureDbReady();
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return { ok: false, message: "User not found." };
  const now = new Date().toISOString();
  await db
    .update(users)
    .set({
      status: "deleted",
      sessionVersion: (user.sessionVersion ?? 0) + 1,
      updatedAt: now,
    })
    .where(eq(users.id, userId));
  await removeAllMemberships(userId);
  await logUserActivity(
    admin.user.id,
    "networks.platform_ban",
    JSON.stringify({ userId }),
  );
  return { ok: true, message: `Banned ${user.displayName} from all networks.` };
}

export async function listAllNetworksAction(): Promise<
  {
    id: string;
    name: string;
    status: string;
    createdAt: string;
    memberCount: number;
  }[]
> {
  const admin = await requirePlatformAdmin();
  if (!admin.ok) return [];
  await ensureDbReady();
  const db = getDb();
  const rows = await db.select().from(networks);
  const out = [];
  for (const n of rows) {
    const [countRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(networkMembers)
      .where(
        and(
          eq(networkMembers.networkId, n.id),
          eq(networkMembers.status, "active"),
        ),
      );
    out.push({
      id: n.id,
      name: n.name,
      status: n.status,
      createdAt: n.createdAt,
      memberCount: Number(countRow?.count ?? 0),
    });
  }
  return out;
}

export async function setNetworkStatusAction(
  networkId: string,
  status: "active" | "paused",
): Promise<{ ok: boolean; message: string }> {
  const admin = await requirePlatformAdmin();
  if (!admin.ok) return { ok: false, message: admin.message };
  await ensureDbReady();
  const db = getDb();
  await db
    .update(networks)
    .set({ status, updatedAt: new Date().toISOString() })
    .where(eq(networks.id, networkId));
  return { ok: true, message: `Network marked ${status}.` };
}
