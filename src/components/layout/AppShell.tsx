import { Box, Container } from "@mui/material";

import { AppHeader } from "@/components/layout/AppHeader";
import { AppTabs } from "@/components/layout/AppTabs";
import { DevBar } from "@/components/layout/DevBar";

/**
 * Authenticated shell wrapping all primary tabs with dev tooling and bottom nav.
 */
export function AppShell({
  children,
  displayName,
  isAdmin,
}: {
  children: React.ReactNode;
  displayName: string;
  isAdmin: boolean;
}) {
  return (
    <>
      <DevBar />
      <AppHeader displayName={displayName} notificationCount={0} />
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
