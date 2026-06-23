import { Box, Container } from "@mui/material";

import { AppHeader } from "@/components/layout/AppHeader";
import { AppTabs } from "@/components/layout/AppTabs";
import { DevBar } from "@/components/layout/DevBar";
import { avatarSrcForKey } from "@/lib/constants/avatars";

/**
 * Authenticated shell wrapping all primary tabs with dev tooling and bottom nav.
 */
export function AppShell({
  children,
  displayName,
  isAdmin,
  avatarKey,
}: {
  children: React.ReactNode;
  displayName: string;
  isAdmin: boolean;
  avatarKey?: string;
}) {
  const avatarSrc = avatarSrcForKey(avatarKey);

  return (
    <>
      <DevBar />
      <AppHeader
        displayName={displayName}
        notificationCount={0}
        avatarSrc={avatarSrc}
      />
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
