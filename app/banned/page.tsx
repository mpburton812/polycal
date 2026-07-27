import { Box, Button, Paper, Typography } from "@mui/material";
import Image from "next/image";
import { redirect } from "next/navigation";

import { getModerationDisplayForUser } from "@/lib/users/moderation-db";
import { auth, signOut } from "@/lib/auth";
import { getLiveUserStatus } from "@/lib/auth-session";
import { formatModerationExpiry } from "@/lib/users/moderation";
import { fontFamilies } from "@/theme/fonts";
import { brutalPaperSx } from "@/theme/brutalUi";
import { GARDEN_TOKENS } from "@/theme/tokens";

/**
 * Minimal shell for banned accounts — reason shown, logout only (PC-362).
 */
export default async function BannedPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const liveStatus = await getLiveUserStatus(session.user.id);
  if (liveStatus === "deleted") {
    redirect("/login");
  }
  if (liveStatus === "paused") {
    redirect("/paused");
  }
  if (liveStatus !== "banned") {
    redirect("/feed");
  }

  const moderation = await getModerationDisplayForUser(session.user.id);
  const expiryLabel = formatModerationExpiry(moderation?.expiresAt);

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
          Account banned
        </Typography>
        <Typography variant="body1" sx={{ mb: 2, color: GARDEN_TOKENS.inkMuted }}>
          You no longer have access to PolyCal networks.
        </Typography>
        {moderation?.reason && (
          <Typography variant="body2" sx={{ mb: 1, fontWeight: 600 }}>
            Reason: {moderation.reason}
          </Typography>
        )}
        {expiryLabel && (
          <Typography variant="body2" sx={{ mb: 3, color: GARDEN_TOKENS.inkMuted }}>
            This ban is scheduled to end on {expiryLabel}.
          </Typography>
        )}
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
      </Paper>
    </Box>
  );
}
