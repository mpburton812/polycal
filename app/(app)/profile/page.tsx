import { Typography } from "@mui/material";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { getNotificationEmailAction, getNotificationPrefsAction } from "@/actions/profile";
import { ProfileSettings } from "@/components/profile/ProfileSettings";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import { users } from "@/lib/db/schema";
import { getVapidPublicKey } from "@/lib/push";
import { resolveTimezone } from "@/lib/schedule/timezone";
import { brutalPageTitleSx } from "@/theme/brutalUi";
import { GARDEN_TOKENS } from "@/theme/tokens";

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
      timezone: users.timezone,
      mustChangePassword: users.mustChangePassword,
      displayName: users.displayName,
      profileBio: users.profileBio,
    })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  const notificationPrefs = await getNotificationPrefsAction();
  const notificationEmail = await getNotificationEmailAction();

  return (
    <>
      <Typography variant="h5" component="h1" gutterBottom sx={brutalPageTitleSx}>
        Profile &amp; Settings
      </Typography>
      <Typography sx={{ mb: 3, color: GARDEN_TOKENS.inkMuted }}>
        Signed in as <strong>{session.user.displayName}</strong> ({session.user.role})
      </Typography>
      <ProfileSettings
        initialDisplayName={row?.displayName ?? session.user.displayName}
        initialProfileBio={row?.profileBio?.trim() || null}
        initialAvatarKey={row?.avatarKey ?? null}
        initialTheme={row?.theme ?? "mint"}
        initialTimezone={resolveTimezone(row?.timezone)}
        initialNotificationPrefs={notificationPrefs}
        initialNotificationEmail={notificationEmail.email}
        initialEmailVerified={notificationEmail.verified}
        mustChangePassword={row?.mustChangePassword ?? false}
        vapidPublicKey={getVapidPublicKey()}
      />
    </>
  );
}
