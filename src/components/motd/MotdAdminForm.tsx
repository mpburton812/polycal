"use client";

import {
  Alert,
  Button,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useState, useTransition } from "react";

import type { MotdAdminState } from "@/lib/motd/types";
import { MOTD_MAX_BODY_LENGTH } from "@/lib/motd/types";

/**
 * Shared publish/clear form for network or platform MOTD (PC-392).
 */
export function MotdAdminForm({
  scopeLabel,
  initial,
  publishAction,
  clearAction,
}: {
  scopeLabel: string;
  initial: MotdAdminState | null;
  publishAction: (input: {
    body: string;
    endsAt?: string | null;
  }) => Promise<{ ok: true; data: MotdAdminState } | { ok: false; message: string }>;
  clearAction: () => Promise<
    { ok: true; data: { cleared: boolean } } | { ok: false; message: string }
  >;
}) {
  const [body, setBody] = useState("");
  const [endsLocal, setEndsLocal] = useState("");
  const [current, setCurrent] = useState<MotdAdminState | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onPublish() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const endsAt = endsLocal.trim()
        ? new Date(endsLocal).toISOString()
        : null;
      if (endsLocal.trim() && Number.isNaN(Date.parse(endsLocal))) {
        setError("End date/time is invalid.");
        return;
      }
      const result = await publishAction({ body, endsAt });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setCurrent(result.data);
      setBody("");
      setEndsLocal("");
      setMessage(`${scopeLabel} message published.`);
    });
  }

  function onClear() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await clearAction();
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setCurrent(null);
      setMessage(`${scopeLabel} message cleared.`);
    });
  }

  return (
    <Stack spacing={1.5}>
      <Typography variant="subtitle1" component="h3">
        Message of the day
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Sends a pop-up to users on this {scopeLabel.toLowerCase()}. Max{" "}
        {MOTD_MAX_BODY_LENGTH} characters. Optional end date stops delivery
        after that time. Users who dismiss see it only once.
      </Typography>
      {current && (
        <Alert severity="info">
          Active: {current.body}
          {current.endsAt
            ? ` (ends ${current.endsAt.slice(0, 16).replace("T", " ")} UTC)`
            : " (no end date)"}
        </Alert>
      )}
      {error && <Alert severity="error">{error}</Alert>}
      {message && <Alert severity="success">{message}</Alert>}
      <TextField
        label="Message"
        value={body}
        onChange={(e) => setBody(e.target.value.slice(0, MOTD_MAX_BODY_LENGTH))}
        multiline
        minRows={2}
        fullWidth
        inputProps={{ maxLength: MOTD_MAX_BODY_LENGTH }}
        helperText={`${body.length}/${MOTD_MAX_BODY_LENGTH}`}
      />
      <TextField
        label="End date/time (optional)"
        type="datetime-local"
        value={endsLocal}
        onChange={(e) => setEndsLocal(e.target.value)}
        InputLabelProps={{ shrink: true }}
        fullWidth
      />
      <Stack direction="row" spacing={1} flexWrap="wrap">
        <Button
          variant="contained"
          onClick={onPublish}
          disabled={pending || body.trim().length === 0}
        >
          Send message
        </Button>
        <Button
          variant="outlined"
          color="warning"
          onClick={onClear}
          disabled={pending || !current}
        >
          Clear active
        </Button>
      </Stack>
    </Stack>
  );
}
