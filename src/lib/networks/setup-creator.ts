import { compare, hash } from "bcryptjs";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";

import type { getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";

export const setupUsernameSchema = z
  .string()
  .trim()
  .min(2, "Username must be at least 2 characters.")
  .max(32, "Username must be 32 characters or fewer.")
  .regex(
    /^[a-z0-9._-]+$/i,
    "Username may only contain letters, numbers, and these characters: . _ -",
  );

export const setupPasswordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(128, "Password must be 128 characters or fewer.")
  .regex(/[A-Za-z]/, "Password must include at least one letter.")
  .regex(/[0-9]/, "Password must include at least one number.");

export type SetupAdminMode = "session" | "existing" | "new";

export type ResolveSetupCreatorInput = {
  tokenEmail: string;
  mode: SetupAdminMode;
  sessionUserId?: string;
  username?: string;
  password?: string;
  displayName?: string;
  confirmPassword?: string;
};

export type ResolveSetupCreatorResult =
  | { ok: true; creatorId: string; signInUsername: string }
  | { ok: false; message: string };

type Db = ReturnType<typeof getDb>;

/**
 * Ensures the setup token email matches the user's notification email.
 * When notification email is unset, bind the token email (proven via magic link).
 */
export function notificationEmailMatchesToken(
  notificationEmail: string | null | undefined,
  tokenEmail: string,
): boolean {
  const token = tokenEmail.trim().toLowerCase();
  if (!notificationEmail) return true;
  return notificationEmail.trim().toLowerCase() === token;
}

/**
 * Resolves which platform user becomes the first network_admin for a setup wizard.
 */
export async function resolveSetupCreator(
  db: Db,
  input: ResolveSetupCreatorInput,
): Promise<ResolveSetupCreatorResult> {
  const tokenEmail = input.tokenEmail.trim().toLowerCase();

  if (input.mode === "session") {
    if (!input.sessionUserId) {
      return { ok: false, message: "Sign in required to continue setup." };
    }
    const [row] = await db
      .select()
      .from(users)
      .where(eq(users.id, input.sessionUserId))
      .limit(1);
    if (!row || row.status !== "active" || row.role === "passive") {
      return { ok: false, message: "Your account cannot create a network." };
    }
    if (!notificationEmailMatchesToken(row.notificationEmail, tokenEmail)) {
      return {
        ok: false,
        message:
          "This setup link was sent to a different email than your account. Sign in with the matching account or request a new link.",
      };
    }
    if (!row.notificationEmail) {
      const now = new Date().toISOString();
      await db
        .update(users)
        .set({ notificationEmail: tokenEmail, updatedAt: now })
        .where(eq(users.id, row.id));
    }
    return { ok: true, creatorId: row.id, signInUsername: row.username };
  }

  if (input.mode === "existing") {
    const usernameParsed = setupUsernameSchema.safeParse(input.username ?? "");
    if (!usernameParsed.success) {
      return { ok: false, message: usernameParsed.error.issues[0]?.message ?? "Invalid username." };
    }
    if (!input.password) {
      return { ok: false, message: "Enter your password." };
    }
    const username = usernameParsed.data.toLowerCase();
    const [row] = await db
      .select()
      .from(users)
      .where(eq(users.username, username))
      .limit(1);
    if (!row || row.status !== "active" || row.role === "passive") {
      return { ok: false, message: "No active account found for that username." };
    }
    if (!notificationEmailMatchesToken(row.notificationEmail, tokenEmail)) {
      return {
        ok: false,
        message:
          "This setup link was sent to a different email than that account. Use the account tied to this email or request a new link.",
      };
    }
    const valid = await compare(input.password, row.passwordHash);
    if (!valid) {
      return { ok: false, message: "Incorrect password." };
    }
    if (!row.notificationEmail) {
      const now = new Date().toISOString();
      await db
        .update(users)
        .set({ notificationEmail: tokenEmail, updatedAt: now })
        .where(eq(users.id, row.id));
    }
    return { ok: true, creatorId: row.id, signInUsername: row.username };
  }

  const usernameParsed = setupUsernameSchema.safeParse(input.username ?? "");
  if (!usernameParsed.success) {
    return { ok: false, message: usernameParsed.error.issues[0]?.message ?? "Invalid username." };
  }
  const displayName = input.displayName?.trim();
  if (!displayName) {
    return { ok: false, message: "Display name is required." };
  }
  const passwordParsed = setupPasswordSchema.safeParse(input.password ?? "");
  if (!passwordParsed.success) {
    return { ok: false, message: passwordParsed.error.issues[0]?.message ?? "Invalid password." };
  }
  if (input.confirmPassword !== input.password) {
    return { ok: false, message: "Passwords do not match." };
  }

  const username = usernameParsed.data.toLowerCase();
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);
  if (existing) {
    return { ok: false, message: "That username is already taken." };
  }

  const creatorId = randomUUID();
  const now = new Date().toISOString();
  const passwordHash = await hash(passwordParsed.data, 12);
  await db.insert(users).values({
    id: creatorId,
    username,
    displayName,
    passwordHash,
    role: "user",
    status: "active",
    mustChangePassword: false,
    onboardingComplete: false,
    theme: "mint",
    timezone: "UTC",
    notificationEmail: tokenEmail,
    createdAt: now,
    updatedAt: now,
  });

  return { ok: true, creatorId, signInUsername: username };
}
