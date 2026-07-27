import { Box, Button, Paper, Typography } from "@mui/material";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { getLiveUserStatus } from "@/lib/auth-session";
import { brutalPaperSx } from "@/theme/brutalUi";
import { GARDEN_TOKENS } from "@/theme/tokens";

/**
 * Simple feedback entry point for paused users (links from /paused).
 */
export default async function FeedbackPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const status = await getLiveUserStatus(session.user.id);
  if (status !== "paused" && status !== "active") {
    redirect(status === "banned" ? "/banned" : "/login");
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
      <Paper sx={{ ...brutalPaperSx, p: 3, maxWidth: 440, width: "100%" }}>
        <Typography variant="h6" gutterBottom>
          Send feedback
        </Typography>
        <Typography variant="body2" sx={{ mb: 2 }}>
          While your account is paused, email your network administrator or use the in-app
          feedback button after access is restored.
        </Typography>
        <Button variant="outlined" href="/paused">
          Back to paused account
        </Button>
      </Paper>
    </Box>
  );
}
