import { compare } from "bcryptjs";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { userHasAdminAccess } from "@/lib/admin-access";
import {
  issueAdminApiToken,
  verifyAdminApiToken,
  type AdminApiUser,
} from "@/lib/alpha-feedback/admin-token";
import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import { users } from "@/lib/db/schema";
import type { UserRole } from "@/types/user";

export type { AdminApiUser };
export { issueAdminApiToken, verifyAdminApiToken };

/**
 * Authenticates admin API callers via session cookie or Bearer token (PC-121).
 */
export async function requireAdminApiAccess(
  request: Request,
): Promise<{ ok: true; user: AdminApiUser } | { ok: false; response: NextResponse }> {
  const header = request.headers.get("authorization");
  if (header?.startsWith("Bearer ")) {
    const tokenUser = verifyAdminApiToken(header.slice("Bearer ".length).trim());
    if (!tokenUser) {
      return {
        ok: false,
        response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      };
    }
    if (!(await userHasAdminAccess(tokenUser.role))) {
      return {
        ok: false,
        response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      };
    }
    return { ok: true, user: tokenUser };
  }

  const session = await auth();
  if (!session?.user?.id) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (!(await userHasAdminAccess(session.user.role as UserRole))) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return {
    ok: true,
    user: {
      id: session.user.id,
      role: session.user.role as UserRole,
      displayName: session.user.displayName ?? session.user.name ?? "Admin",
    },
  };
}

/**
 * Validates username/password and returns an admin API token when the user has admin access.
 */
export async function loginAdminApi(
  username: string,
  password: string,
): Promise<{ ok: true; token: string; user: AdminApiUser } | { ok: false; message: string }> {
  await ensureDbReady();
  const db = getDb();
  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.username, username.toLowerCase()))
    .limit(1);

  if (!row || row.status !== "active" || row.role === "passive") {
    return { ok: false, message: "Invalid credentials." };
  }

  const valid = await compare(password, row.passwordHash);
  if (!valid) {
    return { ok: false, message: "Invalid credentials." };
  }

  if (!(await userHasAdminAccess(row.role as UserRole))) {
    return { ok: false, message: "Admin access required." };
  }

  const user: AdminApiUser = {
    id: row.id,
    role: row.role as UserRole,
    displayName: row.displayName,
  };
  return { ok: true, token: issueAdminApiToken(user), user };
}
