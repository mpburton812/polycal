"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Alert, Box, Button, Paper, TextField, Typography } from "@mui/material";

import { requestPasswordResetAction } from "@/actions/password-reset";
import { brutalPaperSx } from "@/theme/brutalUi";
import { fontFamilies } from "@/theme/fonts";
import { GARDEN_TOKENS } from "@/theme/tokens";

/**
 * Public form to request a password-reset email by username (PC-162).
 */
export function ForgotPasswordForm() {
  const [username, setUsername] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const result = await requestPasswordResetAction(username);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setMessage(result.message);
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
          Forgot password
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Enter your username. If the account has a verified notification email, we will send a
          reset link.
        </Typography>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        {message && (
          <Alert severity="success" sx={{ mb: 2 }}>
            {message}
          </Alert>
        )}
        <Box component="form" onSubmit={handleSubmit}>
          <TextField
            label="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            fullWidth
            required
            autoComplete="username"
            sx={{ mb: 2 }}
          />
          <Button type="submit" variant="contained" fullWidth disabled={pending}>
            Send reset link
          </Button>
        </Box>
        <Button component={Link} href="/login" fullWidth sx={{ mt: 2 }}>
          Back to sign in
        </Button>
      </Paper>
    </Box>
  );
}
