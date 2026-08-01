import { and, asc, eq, ne } from "drizzle-orm";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { userHasAdminAccess } from "@/lib/admin-access";
import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import { users } from "@/lib/db/schema";
import { isNonProductionEnvironment } from "@/lib/env";

/**
 * Lists active login-capable users for the non-production admin impersonation dropdown.
 */
export async function GET(): Promise<NextResponse> {
  if (!isNonProductionEnvironment()) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const session = await auth();
  if (!session?.user || !(await userHasAdminAccess(session.user.role))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await ensureDbReady();

  const db = getDb();
  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      role: users.role,
    })
    .from(users)
    .where(and(eq(users.status, "active"), ne(users.role, "passive")))
    .orderBy(asc(users.displayName));

  return NextResponse.json({ users: rows });
}
