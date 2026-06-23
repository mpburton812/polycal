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
import type { AppEnvironment } from "@/lib/env";
import { forceReloadToLatestVersion } from "@/lib/pwa/force-reload";

interface AdminForceReloadPanelProps {
  environment: AppEnvironment;
  buildSha: string;
  buildBranch: string;
}

/**
 * Admin control to clear PWA caches and reload the newest build in this environment.
 */
export function AdminForceReloadPanel({
  environment,
  buildSha,
  buildBranch,
}: AdminForceReloadPanelProps) {
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
        App version
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Current environment: <strong>{environment}</strong> · build{" "}
        <strong>{buildSha}</strong> · branch <strong>{buildBranch}</strong>.
        Use force reload after a deploy if your browser is still running an older
        cached copy of the app.
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
