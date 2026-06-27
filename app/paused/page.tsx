import { Box, Button, Paper, Typography } from "@mui/material";
import { redirect } from "next/navigation";

import { auth, signOut } from "@/lib/auth";
import { getLiveUserStatus } from "@/lib/auth-session";

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
    redirect("/schedule");
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
        bgcolor: "background.default",
        p: 2,
      }}
    >
      <Paper sx={{ p: 4, width: "100%", maxWidth: 440 }} elevation={2}>
        <Typography variant="h5" component="h1" gutterBottom>
          Account paused
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
          Your account has been paused. Please discuss with a system administrator.
        </Typography>
        <Box component="form" action={signOutAction}>
          <Button type="submit" variant="contained" fullWidth>
            Sign out
          </Button>
        </Box>
      </Paper>
    </Box>
  );
}
