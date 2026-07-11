"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert, Box, Button, Paper, TextField, Typography } from "@mui/material";

import { resetPasswordWithTokenAction } from "@/actions/password-reset";
import { brutalPaperSx } from "@/theme/brutalUi";
import { fontFamilies } from "@/theme/fonts";
import { GARDEN_TOKENS } from "@/theme/tokens";

interface ResetPasswordFormProps {
  token: string;
}

/**
 * Public form to set a new password from a reset-email token (PC-162).
 */
export function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await resetPasswordWithTokenAction({
        token,
        newPassword,
        confirmPassword,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.replace("/login?reset=1");
    });
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
          sx={{ fontFamily: fontFamilies.display, fontWeight: 700, mb: 1 }}
        >
          Choose a new password
        </Typography>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <Box component="form" onSubmit={handleSubmit}>
          <TextField
            label="New password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            fullWidth
            required
            autoComplete="new-password"
            sx={{ mb: 2 }}
          />
          <TextField
            label="Confirm password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            fullWidth
            required
            autoComplete="new-password"
            sx={{ mb: 2 }}
          />
          <Button type="submit" variant="contained" fullWidth disabled={pending || !token}>
            Update password
          </Button>
        </Box>
        <Button component={Link} href="/login" fullWidth sx={{ mt: 2 }}>
          Back to sign in
        </Button>
      </Paper>
    </Box>
  );
}
