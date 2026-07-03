"use client";

import RefreshIcon from "@mui/icons-material/Refresh";
import {
  Alert,
  Button,
  Stack,
  Typography,
} from "@mui/material";
import { useState, useTransition } from "react";

import { logForceReloadAction } from "@/actions/admin";
import { AdminCollapsibleSection } from "@/components/admin/AdminCollapsibleSection";
import type { BuildInfo } from "@/lib/build-info";
import { forceReloadToLatestVersion } from "@/lib/pwa/force-reload";
import { GARDEN_TOKENS } from "@/theme/tokens";

interface AdminVersionPanelProps {
  buildInfo: BuildInfo;
}

/**
 * Admin Version section: current build metadata plus a cache-busting reload control.
 */
export function AdminVersionPanel({ buildInfo }: AdminVersionPanelProps) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleReload() {
    setError(null);
    const confirmed = window.confirm(
      "Reload PolyCal from the server? Cached app files will be cleared and this tab will restart on the newest version for this environment.",
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
    <AdminCollapsibleSection title="Version">
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <Stack spacing={1.5} sx={{ mb: 2 }}>
        <Typography variant="body2">
          <strong>Name:</strong> {buildInfo.name}
        </Typography>
        <Typography variant="body2">
          <strong>Date:</strong> {buildInfo.buildDateLabel}
        </Typography>
        <Typography variant="body2">
          <strong>Changelog:</strong>{" "}
          {buildInfo.changelogEntry ?? (
            <span style={{ color: GARDEN_TOKENS.inkMuted }}>No unreleased entry</span>
          )}
        </Typography>
        <Typography variant="body2">
          <strong>Time:</strong> {buildInfo.buildTimeLabel}
        </Typography>
        <Typography variant="caption" sx={{ color: GARDEN_TOKENS.inkMuted }}>
          Branch {buildInfo.branch} · SHA {buildInfo.gitSha}
        </Typography>
      </Stack>
      <Stack direction="row" spacing={2}>
        <Button
          variant="contained"
          startIcon={<RefreshIcon />}
          onClick={handleReload}
          disabled={pending}
        >
          {pending ? "Reloading…" : "Reload"}
        </Button>
      </Stack>
    </AdminCollapsibleSection>
  );
}
