"use client";

import RefreshIcon from "@mui/icons-material/Refresh";
import CloseIcon from "@mui/icons-material/Close";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Link,
  Stack,
  Typography,
} from "@mui/material";
import { useState, useTransition } from "react";

import { logForceReloadAction } from "@/actions/admin";
import type { BuildInfo } from "@/lib/env";
import type { ChangelogChangeType, ChangelogEntry } from "@/lib/changelog/entries";
import { forceReloadToLatestVersion } from "@/lib/pwa/force-reload";
import { GARDEN_TOKENS } from "@/theme/tokens";

function formatLiveTime(iso: string | null): string {
  if (!iso) return "Unknown";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString();
}

const CHANGE_TYPE_COLOR: Record<ChangelogChangeType, "success" | "info" | "warning"> = {
  added: "success",
  changed: "info",
  fixed: "warning",
};

function ChangelogEntryView({ entry }: { entry: ChangelogEntry }) {
  return (
    <Box>
      <Stack direction="row" spacing={1} alignItems="baseline" flexWrap="wrap">
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          {entry.version}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {entry.date}
        </Typography>
      </Stack>
      <Typography variant="body2" sx={{ mb: 1 }}>
        {entry.summary}
      </Typography>
      <Stack spacing={0.75}>
        {entry.changes.map((change, index) => (
          <Stack key={index} direction="row" spacing={1} alignItems="flex-start">
            <Chip
              label={change.type}
              size="small"
              color={CHANGE_TYPE_COLOR[change.type]}
              variant="outlined"
              sx={{ textTransform: "capitalize", minWidth: 72 }}
            />
            <Typography variant="body2">{change.description}</Typography>
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}

/**
 * Build / changelog status with Check for Update (PC-254).
 * Used on Feed for everyone and inside Admin Code Status.
 */
export function CodeStatusPanel({
  buildInfo,
  changelog,
  latestEntry,
  logForceReload = false,
  embedded = false,
}: {
  buildInfo: BuildInfo;
  changelog: ChangelogEntry[];
  latestEntry: ChangelogEntry | null;
  /** When true (admin panel), audit a force-reload. Feed skips this (PC-254). */
  logForceReload?: boolean;
  /** When true, omit outer border/title (admin collapsible already provides chrome). */
  embedded?: boolean;
}) {
  const [liveInfo, setLiveInfo] = useState<BuildInfo>(buildInfo);
  const [logOpen, setLogOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function checkForUpdate() {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      let latestBuild: BuildInfo;
      try {
        const response = await fetch(`/api/build-info?ts=${Date.now()}`, {
          cache: "no-store",
        });
        if (!response.ok) throw new Error("bad status");
        latestBuild = (await response.json()) as BuildInfo;
      } catch {
        setError("Couldn't check for updates. Please try again.");
        return;
      }

      const updateAvailable =
        latestBuild.sha !== buildInfo.sha && latestBuild.sha !== "local";

      if (updateAvailable) {
        if (logForceReload) {
          await logForceReloadAction();
        }
        await forceReloadToLatestVersion();
        return;
      }

      setLiveInfo(latestBuild);
      setMessage("You're on the latest version for this environment.");
    });
  }

  return (
    <Box
      sx={
        embedded
          ? undefined
          : {
              p: 2,
              mb: 2,
              border: `2px solid ${GARDEN_TOKENS.ink}`,
              borderRadius: 1,
              bgcolor: GARDEN_TOKENS.surface,
            }
      }
      data-testid="code-status-panel"
    >
      {!embedded && (
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
          Code Status
        </Typography>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {message && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setMessage(null)}>
          {message}
        </Alert>
      )}

      <Stack spacing={1.5}>
        <Box>
          <Typography variant="caption" color="text.secondary" display="block">
            Build number
          </Typography>
          <Link
            component="button"
            type="button"
            underline="always"
            onClick={() => setLogOpen(true)}
            sx={{ fontWeight: 700, fontSize: "1.05rem", color: GARDEN_TOKENS.ink }}
            aria-haspopup="dialog"
            data-testid="code-status-build-number"
          >
            {liveInfo.sha}
          </Link>
          <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
            ({liveInfo.environment})
          </Typography>
        </Box>

        <Box>
          <Typography variant="caption" color="text.secondary" display="block">
            Made live in this environment
          </Typography>
          <Typography variant="body2">{formatLiveTime(liveInfo.time)}</Typography>
        </Box>

        {latestEntry && (
          <>
            <Divider />
            <Box>
              <Typography
                variant="caption"
                color="text.secondary"
                display="block"
                sx={{ mb: 0.5 }}
              >
                Latest change control entry
              </Typography>
              <ChangelogEntryView entry={latestEntry} />
            </Box>
          </>
        )}

        <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
          <Button
            variant="contained"
            startIcon={<RefreshIcon />}
            onClick={checkForUpdate}
            disabled={pending}
          >
            {pending ? "Checking…" : "Check for Update"}
          </Button>
        </Stack>
      </Stack>

      <Dialog
        open={logOpen}
        onClose={() => setLogOpen(false)}
        fullWidth
        maxWidth="sm"
        aria-labelledby="change-control-log-title"
      >
        <DialogTitle
          id="change-control-log-title"
          sx={{ display: "flex", alignItems: "center", gap: 1 }}
        >
          <Box sx={{ flex: 1 }}>Change control log</Box>
          <IconButton
            aria-label="Close change control log"
            onClick={() => setLogOpen(false)}
            size="small"
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2.5}>
            {changelog.map((entry) => (
              <ChangelogEntryView key={entry.version} entry={entry} />
            ))}
          </Stack>
        </DialogContent>
      </Dialog>
    </Box>
  );
}
