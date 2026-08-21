import { Box, Button, Paper, Stack, Typography } from "@mui/material";
import Image from "next/image";
import { redirect } from "next/navigation";

import { auth, signOut } from "@/lib/auth";
import { listActiveMemberships } from "@/lib/networks/membership";
import { canAccessRestrictedNetwork } from "@/lib/networks/roles";
import { fontFamilies } from "@/theme/fonts";
import { brutalPaperSx } from "@/theme/brutalUi";
import { GARDEN_TOKENS } from "@/theme/tokens";

/**
 * Shown when the user's only network is pending delete and they are not the Sponsor (PC-462).
 */
export default async function NetworkClosedPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const memberships = await listActiveMemberships(session.user.id);
  const usable = memberships.filter((m) =>
    canAccessRestrictedNetwork({
      role: m.role,
      networkStatus: m.networkStatus,
      isPlatformAdmin: session.user.isPlatformAdmin === true,
    }),
  );
  if (usable.length > 0) {
    redirect("/feed");
  }

  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: GARDEN_TOKENS.background,
        p: 2,
      }}
    >
      <Paper elevation={0} sx={{ ...brutalPaperSx, width: "100%", maxWidth: 480 }}>
        <Box sx={{ display: "flex", justifyContent: "center", mb: 2 }}>
          <Image
            src="/illustrations/empty-schedule-day.svg"
            alt=""
            width={96}
            height={80}
            priority
          />
        </Box>
        <Typography
          variant="h5"
          component="h1"
          gutterBottom
          sx={{ fontFamily: fontFamilies.display, fontWeight: 700, color: GARDEN_TOKENS.ink }}
        >
          Network closing
        </Typography>
        <Typography variant="body1" sx={{ mb: 3, color: GARDEN_TOKENS.inkMuted }}>
          This network is scheduled to close. Contact the Sponsor if you need access restored.
        </Typography>
        <Stack spacing={1}>
          <Box component="form" action={signOutAction}>
            <Button
              type="submit"
              variant="contained"
              fullWidth
              sx={{
                bgcolor: GARDEN_TOKENS.sage,
                color: GARDEN_TOKENS.surface,
                "&:hover": { bgcolor: "#557A5C" },
              }}
            >
              Log out
            </Button>
          </Box>
        </Stack>
      </Paper>
    </Box>
  );
}
