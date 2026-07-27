"use client";

import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from "@mui/material";
import { useState } from "react";

import { LONG_TEXT_MAX } from "@/lib/validation/string-limits";

interface ModerationDialogProps {
  open: boolean;
  title: string;
  confirmLabel: string;
  onClose: () => void;
  onConfirm: (input: { reason: string; durationDays?: number }) => Promise<void>;
}

/**
 * Collects a required reason and optional duration in days for pause/ban actions.
 */
export function ModerationDialog({
  open,
  title,
  confirmLabel,
  onClose,
  onConfirm,
}: ModerationDialogProps) {
  const [reason, setReason] = useState("");
  const [durationDays, setDurationDays] = useState("");
  const [pending, setPending] = useState(false);

  async function handleConfirm() {
    setPending(true);
    try {
      const days = durationDays.trim() ? Number(durationDays) : undefined;
      await onConfirm({
        reason: reason.trim(),
        durationDays: days && Number.isFinite(days) && days > 0 ? Math.floor(days) : undefined,
      });
      setReason("");
      setDurationDays("");
      onClose();
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
        <TextField
          label="Reason"
          required
          multiline
          minRows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          inputProps={{ maxLength: LONG_TEXT_MAX }}
          helperText="Shown to the user when they sign in."
        />
        <TextField
          label="Duration (days, optional)"
          type="number"
          value={durationDays}
          onChange={(e) => setDurationDays(e.target.value)}
          helperText="Leave blank for no automatic end date."
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={() => void handleConfirm()}
          disabled={pending || !reason.trim()}
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
