import { Box, Paper, Typography } from "@mui/material";
import { redirect } from "next/navigation";

import { signIn } from "@/lib/auth";
import { brutalPaperSx } from "@/theme/brutalUi";
import { fontFamilies } from "@/theme/fonts";
import { GARDEN_TOKENS } from "@/theme/tokens";

interface EmailLoginPageProps {
  searchParams: Promise<{ token?: string }>;
}

/**
 * Redeems a one-time email login token via the Credentials provider (PC-465).
 * Does not set mustChangePassword — the JWT marks this as an emailLoginSession.
 */
export default async function EmailLoginPage({ searchParams }: EmailLoginPageProps) {
  const params = await searchParams;
  const token = params.token?.trim() ?? "";
  if (!token) {
    redirect("/login?error=CredentialsSignin");
  }

  try {
    await signIn("credentials", {
      emailLoginToken: token,
      redirectTo: "/feed",
    });
  } catch {
    redirect("/login?error=CredentialsSignin");
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
      <Paper elevation={0} sx={{ ...brutalPaperSx, width: "100%", maxWidth: 400 }}>
        <Typography
          variant="h5"
          component="h1"
          sx={{ fontFamily: fontFamilies.display, fontWeight: 700 }}
        >
          Signing in…
        </Typography>
      </Paper>
    </Box>
  );
}
