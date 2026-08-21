"use client";

import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Link as MuiLink,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import NextLink from "next/link";
import { useState, useTransition } from "react";

import { submitSupportMessageAction } from "@/actions/support-message";
import { useToast } from "@/components/providers/ToastProvider";
import { GARDEN_TOKENS } from "@/theme/tokens";

/**
 * About dialog: legal links plus a support message that becomes a bold
 * platform-admin alert — no email blast (PC-464).
 */
export function AboutDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await submitSupportMessageAction(message);
      showToast(result.message, result.ok ? "success" : "error");
      if (result.ok) {
        setMessage("");
        onClose();
      }
    });
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="about-dialog-title">
      <DialogTitle id="about-dialog-title">About PolyCal</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Typography variant="body2" sx={{ color: GARDEN_TOKENS.inkMuted }}>
            PolyCal helps polycules coordinate calendars. Questions or issues? Send a
            note to platform operators below.
          </Typography>
          <Stack direction="row" spacing={2}>
            <MuiLink component={NextLink} href="/privacy">
              Privacy
            </MuiLink>
            <MuiLink component={NextLink} href="/terms">
              Terms
            </MuiLink>
          </Stack>
          <TextField
            label="Message to platform operators"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            multiline
            minRows={3}
            fullWidth
            inputProps={{ maxLength: 2000, "aria-label": "Support message" }}
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Close</Button>
        <Button variant="contained" onClick={submit} disabled={pending || !message.trim()}>
          Send message
        </Button>
      </DialogActions>
    </Dialog>
  );
}
