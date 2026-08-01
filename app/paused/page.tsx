import { Box, Button, Paper, Stack, Typography } from "@mui/material";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getModerationDisplayForUser } from "@/lib/users/moderation-db";
import { auth, signOut } from "@/lib/auth";
import { getLiveUserStatus } from "@/lib/auth-session";
import { formatModerationExpiry } from "@/lib/users/moderation";
import { fontFamilies } from "@/theme/fonts";
import { brutalPaperSx } from "@/theme/brutalUi";
import { GARDEN_TOKENS } from "@/theme/tokens";

/**
 * Minimal shell for paused accounts — reason, optional end date, leave/feedback/logout (PC-362).
 */
export default async function PausedPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const liveStatus = await getLiveUserStatus(session.user.id);
  if (liveStatus === "deleted") {
    redirect("/login");
  }
  if (liveStatus === "banned") {
    redirect("/banned");
  }
  if (liveStatus !== "paused") {
    redirect("/feed");
  }

  const moderation = await getModerationDisplayForUser(session.user.id);
  const expiryLabel = formatModerationExpiry(moderation?.expiresAt);

  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  async function leaveAction() {
    "use server";
    const { logUserActivity } = await import("@/lib/audit");
    const { auth } = await import("@/lib/auth");
    const current = await auth();
    if (current?.user?.id) {
      await logUserActivity(
        current.user.id,
        "user.paused_leave_request",
        "User requested to leave while paused.",
      );
    }
    const { signOut } = await import("@/lib/auth");
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
          Account paused
        </Typography>
        <Typography variant="body1" sx={{ mb: 2, color: GARDEN_TOKENS.inkMuted }}>
          An administrator has temporarily paused your access.
        </Typography>
        {moderation?.reason && (
          <Typography variant="body2" sx={{ mb: 1, fontWeight: 600 }}>
            Reason: {moderation.reason}
          </Typography>
        )}
        {expiryLabel && (
          <Typography variant="body2" sx={{ mb: 3, color: GARDEN_TOKENS.inkMuted }}>
            Access may resume after {expiryLabel}.
          </Typography>
        )}
        <Stack spacing={1}>
          <Box component="form" action={leaveAction}>
            <Button type="submit" variant="outlined" fullWidth>
              Leave
            </Button>
          </Box>
          <Button component={Link} href="/feedback" variant="outlined" fullWidth>
            Feedback
          </Button>
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
