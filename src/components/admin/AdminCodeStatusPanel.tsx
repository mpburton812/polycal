"use client";

import RefreshIcon from "@mui/icons-material/Refresh";
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
import CloseIcon from "@mui/icons-material/Close";
import { useState, useTransition } from "react";

import { logForceReloadAction } from "@/actions/admin";
import { AdminCollapsibleSection } from "@/components/admin/AdminCollapsibleSection";
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

const CHANGE_TYPE_COLOR: Record<
  ChangelogChangeType,
  "success" | "info" | "warning"
> = {
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
          <Stack
            key={index}
            direction="row"
            spacing={1}
            alignItems="flex-start"
          >
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
 * Admin panel showing the live build number and when it went live in this
 * environment, the most recent change control entry, a Check for Update control
 * that force-reloads when a newer build is available, and the full change log.
 */
export function AdminCodeStatusPanel({
  buildInfo,
  changelog,
  latestEntry,
}: {
  buildInfo: BuildInfo;
  changelog: ChangelogEntry[];
  latestEntry: ChangelogEntry | null;
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
        // A newer deployment is live — record the reload, clear caches, and
        // reload so this tab picks up the newest build.
        await logForceReloadAction();
        await forceReloadToLatestVersion();
        return;
      }

      // Already current — refresh the displayed live build info.
      setLiveInfo(latestBuild);
      setMessage("You're on the latest version for this environment.");
    });
  }

  return (
    <AdminCollapsibleSection title="Code Status">
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
    </AdminCollapsibleSection>
  );
}
