import { Typography } from "@mui/material";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { getNotificationPrefsAction } from "@/actions/profile";
import { ProfileSettings } from "@/components/profile/ProfileSettings";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import { users } from "@/lib/db/schema";

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  await ensureDbReady();
  const db = getDb();
  const [row] = await db
    .select({
      avatarKey: users.avatarKey,
      theme: users.theme,
      mustChangePassword: users.mustChangePassword,
      displayName: users.displayName,
    })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  const notificationPrefs = await getNotificationPrefsAction();

  return (
    <>
      <Typography variant="h5" component="h1" gutterBottom>
        Profile
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Signed in as <strong>{session.user.displayName}</strong> ({session.user.role})
      </Typography>
      <ProfileSettings
        initialDisplayName={row?.displayName ?? session.user.displayName}
        initialAvatarKey={row?.avatarKey ?? null}
        initialTheme={row?.theme ?? "mint"}
        initialNotificationPrefs={notificationPrefs}
        mustChangePassword={row?.mustChangePassword ?? false}
      />
    </>
  );
}
