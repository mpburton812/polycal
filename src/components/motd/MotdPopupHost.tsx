"use client";

import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from "@mui/material";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import {
  acknowledgeMotdAction,
  getActiveMotdsForViewerAction,
} from "@/actions/motd";
import type { MotdPublic } from "@/lib/motd/types";
import { GARDEN_TOKENS } from "@/theme/tokens";

const POLL_MS = 45_000;

/**
 * Soft real-time MOTD host: polls, refetches on focus/nav, shows platform then network.
 * Dismiss records an acknowledgment so the message never reappears for this user (PC-392).
 */
export function MotdPopupHost() {
  const pathname = usePathname();
  const [queue, setQueue] = useState<MotdPublic[]>([]);
  const [acking, setAcking] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const result = await getActiveMotdsForViewerAction();
      if (!result.ok) return;
      setQueue(result.data);
    } catch {
      // Ignore transient network / session errors so the shell stays usable.
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

  useEffect(() => {
    void refresh();
  }, [pathname, refresh]);

  const current = queue[0] ?? null;

  async function dismiss() {
    if (!current || acking) return;
    setAcking(true);
    const id = current.id;
    setQueue((q) => q.filter((m) => m.id !== id));
    try {
      await acknowledgeMotdAction(id);
    } finally {
      setAcking(false);
      void refresh();
    }
  }

  if (!current) return null;

  const title =
    current.scope === "platform" ? "Platform message" : "Network message";

  return (
    <Dialog
      open
      onClose={() => void dismiss()}
      aria-labelledby="motd-dialog-title"
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
      <DialogTitle id="motd-dialog-title">{title}</DialogTitle>
      <DialogContent>
        <Typography variant="body1" sx={{ whiteSpace: "pre-wrap" }}>
          {current.body}
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button
          variant="contained"
          onClick={() => void dismiss()}
          disabled={acking}
          autoFocus
        >
          OK
        </Button>
      </DialogActions>
    </Dialog>
  );
}
