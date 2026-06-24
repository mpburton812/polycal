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

/** Shared username rules for provisioned active accounts. */
const usernameSchema = z
  .string()
  .trim()
  .min(2, "Username must be at least 2 characters.")
  .max(32, "Username must be 32 characters or fewer.")
  .regex(
    /^[a-z0-9._-]+$/i,
    "Username may only contain letters, numbers, and these characters: . _ -",
  );

const activeUserSchema = z.object({
  username: usernameSchema,
  displayName: z
    .string()
    .trim()
    .min(1, "Display name is required.")
    .max(80, "Display name must be 80 characters or fewer."),
  role: z.enum(["admin", "user"]),
  avatarKey: z.string().optional(),
});

const passiveUserSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "Display name is required.")
    .max(80, "Display name must be 80 characters or fewer."),
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
  temporaryPassword?: string;
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

/** Turns Zod issues into a single user-facing sentence. */
function formatZodError(error: z.ZodError): string {
  if (error.issues.length === 0) {
    return "One or more fields are invalid.";
  }

  return error.issues
    .map((issue) => {
      const field = issue.path.at(-1);
      const label =
        field === "username"
          ? "Username"
          : field === "displayName"
            ? "Display name"
            : field === "role"
              ? "Role"
              : field
                ? String(field)
                : "Input";
      return `${label}: ${issue.message}`;
    })
    .join(" ");
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
    return { ok: false, message: formatZodError(parsed.error) };
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
    temporaryPassword: tempPassword,
    loginInstructions: buildLoginInstructions({ username, password: tempPassword }),
  };
}

const updateProvisionedUsernameSchema = z.object({
  userId: z.string().min(1, "User id is required."),
  username: usernameSchema,
  temporaryPassword: z.string().min(8, "Temporary password is missing or too short."),
});

/**
 * Checks whether a username is available (PC-35).
 */
export async function checkUsernameAvailableAction(
  username: string,
): Promise<{ available: boolean; message: string }> {
  const parsed = usernameSchema.safeParse(username);
  if (!parsed.success) {
    return {
      available: false,
      message: formatZodError(parsed.error),
    };
  }

  await ensureDbReady();
  const db = getDb();
  const normalized = parsed.data.toLowerCase();
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, normalized))
    .limit(1);

  if (existing) {
    return { available: false, message: "Username is already in use." };
  }

  return { available: true, message: "Username is available." };
}

/**
 * Updates username for a freshly provisioned user and returns refreshed credentials (PC-35).
 */
export async function updateProvisionedUsernameAction(
  input: z.infer<typeof updateProvisionedUsernameSchema>,
): Promise<CreateUserResult> {
  if (!(await canProvisionUsers())) {
    return { ok: false, message: "You do not have permission to update users." };
  }

  const parsed = updateProvisionedUsernameSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: formatZodError(parsed.error) };
  }

  await ensureDbReady();
  const db = getDb();
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, parsed.data.userId))
    .limit(1);

  if (!user || user.role === "passive" || !user.mustChangePassword) {
    return { ok: false, message: "Only newly provisioned active users can be updated here." };
  }

  const username = parsed.data.username.toLowerCase();
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);
  if (existing && existing.id !== user.id) {
    return { ok: false, message: "Username is already in use." };
  }

  const now = new Date().toISOString();
  await db
    .update(users)
    .set({ username, updatedAt: now })
    .where(eq(users.id, user.id));

  revalidatePath("/people-places");
  revalidatePath("/admin");
  revalidatePath("/api/dev/users");

  return {
    ok: true,
    message: "Username updated.",
    userId: user.id,
    temporaryPassword: parsed.data.temporaryPassword,
    loginInstructions: buildLoginInstructions({
      username,
      password: parsed.data.temporaryPassword,
    }),
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
    return { ok: false, message: formatZodError(parsed.error) };
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
