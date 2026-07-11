import { Alert, Box, Button, Paper, Typography } from "@mui/material";
import Link from "next/link";

import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { brutalPaperSx } from "@/theme/brutalUi";
import { fontFamilies } from "@/theme/fonts";
import { GARDEN_TOKENS } from "@/theme/tokens";

interface ResetPasswordPageProps {
  searchParams: Promise<{ token?: string }>;
}

/**
 * Public reset-password page — requires a valid email token (PC-162).
 */
export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const params = await searchParams;
  const token = params.token?.trim() ?? "";

  if (!token) {
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
            sx={{ fontFamily: fontFamilies.display, fontWeight: 700, mb: 1 }}
          >
            Reset link missing
          </Typography>
          <Alert severity="warning" sx={{ mb: 2 }}>
            Open the link from your email, or request a new reset.
          </Alert>
          <Button component={Link} href="/forgot-password" variant="contained" fullWidth>
            Request reset link
          </Button>
        </Paper>
      </Box>
    );
  }

  return <ResetPasswordForm token={token} />;
}
