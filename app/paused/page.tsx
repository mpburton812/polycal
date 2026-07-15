import { Box, Button, Paper, Typography } from "@mui/material";
import Image from "next/image";
import { redirect } from "next/navigation";

import { auth, signOut } from "@/lib/auth";
import { getLiveUserStatus } from "@/lib/auth-session";
import { fontFamilies } from "@/theme/fonts";
import { brutalPaperSx } from "@/theme/brutalUi";
import { GARDEN_TOKENS } from "@/theme/tokens";

/**
 * Minimal shell for paused accounts — no app navigation (PC-55).
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
  if (liveStatus !== "paused") {
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
      <Paper elevation={0} sx={{ ...brutalPaperSx, width: "100%", maxWidth: 440 }}>
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
        <Typography variant="body1" sx={{ mb: 3, color: GARDEN_TOKENS.inkMuted }}>
          An administrator has temporarily paused your access. Your data is safe — reach out to
          your group admin if you think this is a mistake.
        </Typography>
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
            Sign out
          </Button>
        </Box>
      </Paper>
    </Box>
  );
}
