"use client";

import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from "@mui/material";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import {
  dismissNotificationAction,
  getNotificationInboxAction,
  type NotificationItem,
} from "@/actions/notifications";
import { GARDEN_TOKENS } from "@/theme/tokens";

const POLL_MS = 60_000;

/**
 * Surfaces Google Calendar sync failures with a deep link to profile settings (PC-398).
 * Skipped under E2E so modal aria-hiding does not break shell assertions.
 * Prefer `disabled` from the server shell (`E2E_TEST_MODE`) — CI builds do not
 * inline `NEXT_PUBLIC_E2E_TEST_MODE` into the client bundle.
 */
export function CalendarSyncFailurePopupHost({
  disabled = false,
}: {
  disabled?: boolean;
} = {}) {
  const pathname = usePathname();
  const router = useRouter();
  const [item, setItem] = useState<NotificationItem | null>(null);
  const [busy, setBusy] = useState(false);
  const skip =
    disabled || process.env.NEXT_PUBLIC_E2E_TEST_MODE === "1";

  const refresh = useCallback(async () => {
    if (skip) return;
    try {
      const result = await getNotificationInboxAction();
      if (!result.ok) return;
      const failed = result.items.find((row) => row.type === "calendar_google_failed") ?? null;
      setItem(failed);
    } catch {
      // Ignore transient errors — shell must stay usable.
    }
  }, [skip]);

  useEffect(() => {
    if (skip) return;
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
  }, [refresh, skip]);

  useEffect(() => {
    void refresh();
  }, [pathname, refresh]);

  if (skip) return null;
  if (!item) return null;

  async function dismissOnly() {
    if (!item || busy) return;
    setBusy(true);
    const id = item.id;
    setItem(null);
    try {
      await dismissNotificationAction(id);
    } finally {
      setBusy(false);
      void refresh();
    }
  }

  async function openSettings() {
    if (!item || busy) return;
    setBusy(true);
    const id = item.id;
    setItem(null);
    try {
      await dismissNotificationAction(id);
      router.push("/profile#calendar-integration");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onClose={() => void dismissOnly()}
      aria-labelledby="calendar-sync-fail-title"
      PaperProps={{
        sx: {
          border: `3px solid ${GARDEN_TOKENS.ink}`,
          borderRadius: 2,
        },
      }}
    >
      <DialogTitle id="calendar-sync-fail-title">Google Calendar sync failed</DialogTitle>
      <DialogContent>
        <Typography variant="body2">{item.message}</Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={() => void dismissOnly()} disabled={busy}>
          Dismiss
        </Button>
        <Button variant="contained" onClick={() => void openSettings()} disabled={busy}>
          Open calendar settings
        </Button>
      </DialogActions>
    </Dialog>
  );
}
