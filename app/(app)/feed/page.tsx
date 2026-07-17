import { redirect } from "next/navigation";

import { listPeopleAction } from "@/actions/users";
import { FeedClient } from "@/components/feed/FeedClient";
import { auth } from "@/lib/auth";
import { userHasAdminAccess } from "@/lib/admin-access";
import { CHANGELOG, getLatestChangelogEntry } from "@/lib/changelog/entries";
import { getBuildInfo } from "@/lib/env";
import type { UserRole } from "@/types/user";

/** Feed tab — milestones and network chat (PC-225). Code Status for everyone (PC-254). */
export default async function FeedPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const isAdmin = await userHasAdminAccess(session.user.role as UserRole);
  const people = await listPeopleAction();
  const buildInfo = getBuildInfo();
  const latestEntry = getLatestChangelogEntry();

  return (
    <FeedClient
      currentUserId={session.user.id}
      isAdmin={isAdmin}
      people={people}
      buildInfo={buildInfo}
      changelog={CHANGELOG}
      latestChangelogEntry={latestEntry}
    />
  );
}
