import { Box, Container } from "@mui/material";

import { AppHeader } from "@/components/layout/AppHeader";
import { AppTabs } from "@/components/layout/AppTabs";
import { DevBar } from "@/components/layout/DevBar";
import { PushSubscriptionManager } from "@/components/notifications/PushSubscriptionManager";
import { avatarSrcForKey } from "@/lib/constants/avatars";
import { getVapidPublicKey } from "@/lib/push";
import type { NotificationItem } from "@/actions/notifications";

/**
 * Authenticated shell wrapping all primary tabs with dev tooling and bottom nav.
 */
export function AppShell({
  children,
  displayName,
  groupName,
  isAdmin,
  avatarKey,
  notificationCount = 0,
  notificationItems = [],
}: {
  children: React.ReactNode;
  displayName: string;
  groupName: string;
  isAdmin: boolean;
  avatarKey?: string;
  notificationCount?: number;
  notificationItems?: NotificationItem[];
}) {
  const avatarSrc = avatarSrcForKey(avatarKey);
  const vapidPublicKey = getVapidPublicKey();

  return (
    <>
      <PushSubscriptionManager vapidPublicKey={vapidPublicKey} />
      <Box
        sx={{
          position: "sticky",
          top: 0,
          // Static z-index — theme callbacks cannot cross the RSC → MUI client boundary.
          zIndex: 1101,
        }}
      >
        <DevBar />
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
      <Box sx={{ height: 56 }} aria-hidden />
    </>
  );
}
