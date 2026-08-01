"use client";

import {
  Alert,
  Box,
  Button,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useState, useTransition } from "react";

import { changePasswordAction } from "@/actions/profile";

/**
 * Blocks app usage until a mandatory password change completes (PC-33).
 */
export function MustChangePasswordForm() {
  const router = useRouter();
  const { update } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await changePasswordAction(formData);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      await update({
        user: {
          mustChangePassword: false,
          sessionVersion: result.sessionVersion,
        },
      });
      router.refresh();
    });
  }

  return (
    <Paper sx={{ p: 3, maxWidth: 480, mx: "auto" }}>
      <Typography variant="h5" component="h1" gutterBottom>
        Change your password
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        You must set a new password before using PolyCal.
      </Typography>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <Box component="form" onSubmit={handleSubmit}>
        <Stack spacing={2}>
          <TextField
            name="currentPassword"
            label="Current password"
            type="password"
            required
            fullWidth
            autoComplete="current-password"
          />
          <TextField
            name="newPassword"
            label="New password"
            type="password"
            required
            fullWidth
            autoComplete="new-password"
            helperText="At least 8 characters"
          />
          <TextField
            name="confirmPassword"
            label="Confirm new password"
            type="password"
            required
            fullWidth
            autoComplete="new-password"
          />
          <Button type="submit" variant="contained" disabled={pending}>
            {pending ? "Saving…" : "Save password"}
          </Button>
        </Stack>
      </Box>
    </Paper>
  );
}
