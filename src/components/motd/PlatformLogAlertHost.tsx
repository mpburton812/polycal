"use client";

import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useState } from "react";

import {
  acknowledgePlatformLogAction,
  listUnackedPlatformLogAlertsAction,
  type PlatformLogAlert,
} from "@/actions/platform-log";
import { GARDEN_TOKENS } from "@/theme/tokens";

const POLL_MS = 45_000;

/**
 * Formats an ISO timestamp for the alert "When" line (PC-497).
 */
function formatAlertWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

/**
 * Second MOTD-like queue: unacked major/emphasized platform log rows for
 * platform operators only. Dismiss records an acknowledgment (PC-463).
 * Shows By / When / optional target for operator context (PC-497).
 */
export function PlatformLogAlertHost() {
  const [queue, setQueue] = useState<PlatformLogAlert[]>([]);
  const [acking, setAcking] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const items = await listUnackedPlatformLogAlertsAction();
      setQueue(items);
    } catch {
      // Ignore transient errors so the shell stays usable.
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), POLL_MS);
    function onVisible() {
      if (document.visibilityState === "visible") void refresh();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  const current = queue[0] ?? null;

  async function dismiss() {
    if (!current || acking) return;
    setAcking(true);
    const id = current.id;
    setQueue((q) => q.filter((item) => item.id !== id));
    try {
      await acknowledgePlatformLogAction(id);
    } finally {
      setAcking(false);
      void refresh();
    }
  }

  if (!current) return null;

  const targetLabel = current.targetDisplayName?.trim() || null;

  return (
    <Dialog
      open
      onClose={() => void dismiss()}
      aria-labelledby="platform-log-alert-title"
      slotProps={{
        paper: {
          sx: {
            border: `3px solid ${GARDEN_TOKENS.ink}`,
            boxShadow: "none",
            bgcolor: GARDEN_TOKENS.surface,
            maxWidth: 420,
          },
        },
      }}
    >
      <DialogTitle id="platform-log-alert-title">Platform alert</DialogTitle>
      <DialogContent>
        <Stack spacing={1.25}>
          <Typography
            variant="body1"
            sx={{ whiteSpace: "pre-wrap", fontWeight: current.emphasized ? 700 : 400 }}
          >
            {current.summary}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            By: {current.actorDisplayName?.trim() || "Unknown"}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            When: {formatAlertWhen(current.createdAt)}
          </Typography>
          {targetLabel ? (
            <Typography variant="body2" color="text.secondary">
              Target: {targetLabel}
            </Typography>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button variant="contained" onClick={() => void dismiss()} disabled={acking} autoFocus>
          OK
        </Button>
      </DialogActions>
    </Dialog>
  );
}
