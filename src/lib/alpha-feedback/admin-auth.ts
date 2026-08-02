import { compare } from "bcryptjs";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { adminAccessFromSessionUser, userHasAdminAccess } from "@/lib/admin-access";
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
 *
 * Bearer tokens are self-contained and live for 12h, so the role they carry can
 * be stale — a demoted, paused, or deleted admin would keep full tracker access
 * until expiry. The current row is re-read from the database on every Bearer
 * request and the token's claims are ignored in favour of it (PC-353).
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

    await ensureDbReady();
    const db = getDb();
    const [row] = await db
      .select({
        id: users.id,
        role: users.role,
        status: users.status,
        displayName: users.displayName,
      })
      .from(users)
      .where(eq(users.id, tokenUser.id))
      .limit(1);

    if (!row || row.status !== "active" || !(await userHasAdminAccess(row.role as UserRole))) {
      return {
        ok: false,
        response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      };
    }
    return {
      ok: true,
      user: { id: row.id, role: row.role as UserRole, displayName: row.displayName },
    };
  }

  const session = await auth();
  if (!session?.user?.id) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (session.user.accountStatus === "paused") {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  if (!(await userHasAdminAccess(adminAccessFromSessionUser(session.user)))) {
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
