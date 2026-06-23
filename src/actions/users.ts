"use server";

import { hash } from "bcryptjs";
import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { logUserActivity } from "@/lib/audit";
import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import { polyGroup, users, type UserRole } from "@/lib/db/schema";
import {
  buildLoginInstructions,
  generateTemporaryPassword,
} from "@/lib/users/credentials";

const activeUserSchema = z.object({
  username: z
    .string()
    .trim()
    .min(2)
    .max(32)
    .regex(/^[a-z0-9._-]+$/i, "Username may only contain letters, numbers, . _ -"),
  displayName: z.string().trim().min(1).max(80),
  role: z.enum(["admin", "user"]),
  avatarKey: z.string().optional(),
});

const passiveUserSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  avatarKey: z.string().optional(),
});

export interface PersonSummary {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  status: string;
  avatarKey: string | null;
}

export interface CreateUserResult {
  ok: boolean;
  message: string;
  loginInstructions?: string;
  userId?: string;
}

/**
 * Returns whether the session may create users (admin or open provisioning).
 */
async function canProvisionUsers(): Promise<boolean> {
  const session = await auth();
  if (!session?.user) return false;
  if (session.user.role === "admin") return true;

  await ensureDbReady();
  const db = getDb();
  const [group] = await db.select().from(polyGroup).where(eq(polyGroup.id, 1)).limit(1);
  return Boolean(group?.allowUserProvisioning);
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);
}

/**
 * Lists active and passive users for the People tab (PC-35/36).
 */
export async function listPeopleAction(): Promise<PersonSummary[]> {
  await ensureDbReady();
  const db = getDb();
  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      role: users.role,
      status: users.status,
      avatarKey: users.avatarKey,
    })
    .from(users)
    .where(eq(users.status, "active"))
    .orderBy(asc(users.displayName));

  return rows.map((row) => ({
    ...row,
    avatarKey: row.avatarKey ?? null,
  }));
}

/**
 * Creates an active user with a temporary password and clipboard instructions (PC-35).
 */
export async function createActiveUserAction(
  input: z.infer<typeof activeUserSchema>,
): Promise<CreateUserResult> {
  if (!(await canProvisionUsers())) {
    return { ok: false, message: "You do not have permission to create users." };
  }

  const session = await auth();
  const parsed = activeUserSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  await ensureDbReady();
  const db = getDb();
  const username = parsed.data.username.toLowerCase();
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);
  if (existing) {
    return { ok: false, message: "Username is already taken." };
  }

  const tempPassword = generateTemporaryPassword();
  const passwordHash = await hash(tempPassword, 12);
  const now = new Date().toISOString();
  const userId = `user-${randomUUID()}`;

  await db.insert(users).values({
    id: userId,
    username,
    displayName: parsed.data.displayName,
    passwordHash,
    role: parsed.data.role,
    status: "active",
    mustChangePassword: true,
    avatarKey: parsed.data.avatarKey ?? "bird_blue",
    theme: "mint",
    loginCount: 0,
    createdAt: now,
    updatedAt: now,
  });

  await logUserActivity(
    session?.user?.id ?? null,
    "users.create_active",
    JSON.stringify({ userId, username, role: parsed.data.role }),
  );

  revalidatePath("/people-places");
  revalidatePath("/admin");
  revalidatePath("/api/dev/users");

  return {
    ok: true,
    message: `Created active user ${parsed.data.displayName}.`,
    userId,
    loginInstructions: buildLoginInstructions({ username, password: tempPassword }),
  };
}

/**
 * Creates a passive schedulable profile without login credentials (PC-35/36).
 */
export async function createPassiveUserAction(
  input: z.infer<typeof passiveUserSchema>,
): Promise<CreateUserResult> {
  if (!(await canProvisionUsers())) {
    return { ok: false, message: "You do not have permission to create users." };
  }

  const session = await auth();
  const parsed = passiveUserSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  await ensureDbReady();
  const db = getDb();
  const now = new Date().toISOString();
  const userId = `passive-${randomUUID()}`;
  const username = `passive-${slugify(parsed.data.displayName)}-${userId.slice(-6)}`;
  const passwordHash = await hash(randomUUID(), 12);

  await db.insert(users).values({
    id: userId,
    username,
    displayName: parsed.data.displayName,
    passwordHash,
    role: "passive",
    status: "active",
    mustChangePassword: false,
    avatarKey: parsed.data.avatarKey ?? "bird_green",
    theme: "mint",
    loginCount: 0,
    createdAt: now,
    updatedAt: now,
  });

  await logUserActivity(
    session?.user?.id ?? null,
    "users.create_passive",
    JSON.stringify({ userId, displayName: parsed.data.displayName }),
  );

  revalidatePath("/people-places");
  revalidatePath("/admin");

  return {
    ok: true,
    message: `Created passive profile ${parsed.data.displayName}.`,
    userId,
  };
}

export async function getProvisioningPolicyAction(): Promise<{
  canProvision: boolean;
  isAdmin: boolean;
}> {
  const session = await auth();
  const isAdmin = session?.user?.role === "admin";
  return {
    canProvision: await canProvisionUsers(),
    isAdmin: Boolean(isAdmin),
  };
}
