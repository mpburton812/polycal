import { Box, Container } from "@mui/material";

import { FeedbackFab } from "@/components/feedback/FeedbackFab";
import { AppHeader } from "@/components/layout/AppHeader";
import { AppTabs } from "@/components/layout/AppTabs";
import { DevBar } from "@/components/layout/DevBar";
import { PushSubscriptionManager } from "@/components/notifications/PushSubscriptionManager";
import { avatarSrcForKey } from "@/lib/constants/avatars";
import { getAppEnvironment } from "@/lib/env";
import { getVapidPublicKey } from "@/lib/push";
import type { NotificationItem } from "@/actions/notifications";
import type { NotificationPrefs } from "@/types/notification-prefs";

/**
 * Authenticated shell wrapping all primary tabs with env banner and bottom nav.
 */
export function AppShell({
  children,
  displayName,
  groupName,
  isAdmin,
  avatarKey,
  notificationCount = 0,
  notificationItems = [],
  notificationPrefs,
}: {
  children: React.ReactNode;
  displayName: string;
  groupName: string;
  isAdmin: boolean;
  avatarKey?: string;
  notificationCount?: number;
  notificationItems?: NotificationItem[];
  notificationPrefs: NotificationPrefs;
}) {
  const avatarSrc = avatarSrcForKey(avatarKey);
  const vapidPublicKey = getVapidPublicKey();
  /** Restore colored env banner (DEV red / TEST yellow / …) (PC-172). */
  const showEnvBanner = getAppEnvironment() !== "production";

  return (
    <>
      <PushSubscriptionManager
        vapidPublicKey={vapidPublicKey}
        pushEnabled={notificationPrefs.channels.push}
      />
      <Box
        sx={{
          position: "sticky",
          top: 0,
          // Static z-index — theme callbacks cannot cross the RSC → MUI client boundary.
          zIndex: 1101,
        }}
      >
        {showEnvBanner ? <DevBar /> : null}
        <AppHeader
          displayName={displayName}
          groupName={groupName}
          notificationCount={notificationCount}
          notificationItems={notificationItems}
          avatarSrc={avatarSrc}
        />
      </Box>
      <Container
        component="main"
        maxWidth="md"
        sx={{ py: 2, pb: 10, minHeight: "calc(100vh - 120px)" }}
      >
        {children}
      </Container>
      <AppTabs isAdmin={isAdmin} />
      <FeedbackFab />
      <Box sx={{ height: 56 }} aria-hidden />
    </>
  );
}
