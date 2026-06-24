"use client";

import RefreshIcon from "@mui/icons-material/Refresh";
import {
  Alert,
  Button,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { useState, useTransition } from "react";

import { logForceReloadAction } from "@/actions/admin";
import { forceReloadToLatestVersion } from "@/lib/pwa/force-reload";

/**
 * Admin control to clear PWA caches and reload the newest build in this environment.
 */
export function AdminForceReloadPanel() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleForceReload() {
    setError(null);
    const confirmed = window.confirm(
      "Force reload PolyCal from the server? Cached app files will be cleared and this tab will restart on the newest version for this environment.",
    );
    if (!confirmed) return;

    startTransition(async () => {
      const result = await logForceReloadAction();
      if (!result.ok) {
        setError(result.message);
        return;
      }
      await forceReloadToLatestVersion();
    });
  }

  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h6" gutterBottom>
        Force Reload
      </Typography>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <Stack direction="row" spacing={2}>
        <Button
          variant="contained"
          startIcon={<RefreshIcon />}
          onClick={handleForceReload}
          disabled={pending}
        >
          {pending ? "Reloading…" : "Force reload newest version"}
        </Button>
      </Stack>
    </Paper>
  );
}
