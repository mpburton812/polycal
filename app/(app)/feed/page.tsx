import { redirect } from "next/navigation";

import { listPeopleAction } from "@/actions/users";
import { FeedClient } from "@/components/feed/FeedClient";
import { auth } from "@/lib/auth";
import { userHasAdminAccess } from "@/lib/admin-access";
import { isFeedEnabledForActiveNetwork } from "@/lib/feed/feed-enabled";
import type { UserRole } from "@/types/user";

/** Feed tab — milestones and network chat (PC-225). */
export default async function FeedPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  if (!(await isFeedEnabledForActiveNetwork())) {
    redirect("/schedule");
  }

  const isAdmin = await userHasAdminAccess(session.user.role as UserRole);
  const people = await listPeopleAction();

  return (
    <FeedClient
      currentUserId={session.user.id}
      isAdmin={isAdmin}
      people={people}
    />
  );
}
