"use client";

import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { signOut } from "next-auth/react";
import { useState, useTransition } from "react";

import { exportMyDataAction } from "@/actions/account";
import { deleteMyAccountAction } from "@/actions/users";
import { ACCOUNT_DELETE_CONFIRMATION_PHRASE } from "@/lib/users/account-deletion";
import { brutalPaperSx, brutalSectionTitleSx } from "@/theme/brutalUi";
import { GARDEN_TOKENS } from "@/theme/tokens";

/**
 * Self-service data export and account deletion (PC-354).
 *
 * Split out of ProfileSettings because it is the only destructive surface on the page and
 * benefits from being reviewable on its own.
 */
export function AccountDataSettings() {
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [exportPending, startExportTransition] = useTransition();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletePending, startDeleteTransition] = useTransition();

  function handleDownload() {
    setExportError(null);
    setExportMessage(null);
    startExportTransition(async () => {
      const result = await exportMyDataAction();
      if (!result.ok) {
        setExportError(result.message);
        return;
      }

      // Build the file in the browser so the JSON never needs a separate authenticated
      // download route.
      const blob = new Blob([JSON.stringify(result.data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = result.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setExportMessage(`Downloaded ${result.filename}.`);
    });
  }

  function closeDialog() {
    if (deletePending) return;
    setDialogOpen(false);
    setPassword("");
    setConfirmation("");
    setDeleteError(null);
  }

  function handleDelete() {
    setDeleteError(null);
    startDeleteTransition(async () => {
      const result = await deleteMyAccountAction({ password, confirmation });
      if (!result.ok) {
        setDeleteError(result.message);
        return;
      }
      // The account row is already anonymized; drop the now-invalid session cookie too.
      await signOut({ callbackUrl: "/login" });
    });
  }

  return (
    <Paper elevation={0} sx={brutalPaperSx}>
      <Typography variant="h6" gutterBottom sx={brutalSectionTitleSx}>
        Your data
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Download a copy of your PolyCal data, or permanently delete your account.
      </Typography>

      {exportError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {exportError}
        </Alert>
      )}
      {exportMessage && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {exportMessage}
        </Alert>
      )}
      <Button variant="outlined" onClick={handleDownload} disabled={exportPending}>
        {exportPending ? "Preparing…" : "Download my data"}
      </Button>
      <Typography variant="caption" component="p" sx={{ mt: 1, color: GARDEN_TOKENS.inkMuted }}>
        JSON file with your profile, preferences, proposals you authored, and your partnership
        summary.
      </Typography>

      <Typography variant="subtitle2" sx={{ mt: 3 }}>
        Delete my account
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Permanently erases your profile, avatar, preferences, notification email, push
        subscriptions, and calendar connection, archives proposals you authored, and signs you
        out everywhere. This cannot be undone.
      </Typography>
      <Button
        variant="outlined"
        color="error"
        onClick={() => setDialogOpen(true)}
        disabled={deletePending}
      >
        Delete my account
      </Button>

      <Dialog
        open={dialogOpen}
        onClose={closeDialog}
        aria-labelledby="delete-account-title"
        aria-describedby="delete-account-description"
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle id="delete-account-title">Delete your account?</DialogTitle>
        <DialogContent>
          <DialogContentText id="delete-account-description" sx={{ mb: 2 }}>
            This permanently deletes your PolyCal account and cannot be undone. Download your data
            first if you want a copy.
          </DialogContentText>
          {deleteError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {deleteError}
            </Alert>
          )}
          <Stack spacing={2}>
            <TextField
              label="Current password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              fullWidth
              required
            />
            <TextField
              label={`Type "${ACCOUNT_DELETE_CONFIRMATION_PHRASE}"`}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="off"
              fullWidth
              required
              helperText="Confirms you understand this is permanent."
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog} disabled={deletePending} color="inherit">
            Cancel
          </Button>
          <Button
            onClick={handleDelete}
            color="error"
            variant="contained"
            disabled={deletePending || password.length === 0 || confirmation.length === 0}
          >
            {deletePending ? "Deleting…" : "Delete permanently"}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
