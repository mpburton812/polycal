"use client";

import {
  Alert,
  Button,
  FormControlLabel,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { useState, useTransition } from "react";

import type { MotdAdminState } from "@/lib/motd/types";
import { MOTD_MAX_BODY_LENGTH } from "@/lib/motd/types";

type MotdPublishAction = (input: {
  body: string;
  endsAt?: string | null;
}) => Promise<{ ok: true; data: MotdAdminState } | { ok: false; message: string }>;

type MotdClearAction = () => Promise<
  { ok: true; data: { cleared: boolean } } | { ok: false; message: string }
>;

/**
 * Shared publish/clear form for network or platform MOTD (PC-392 / PC-406).
 * Platform admins may toggle All Platform to target the platform-scoped actions.
 */
export function MotdAdminForm({
  scopeLabel,
  initial,
  publishAction,
  clearAction,
  allowAllPlatformToggle = false,
  publishPlatformAction,
  clearPlatformAction,
  initialPlatform = null,
}: {
  scopeLabel: string;
  initial: MotdAdminState | null;
  publishAction: MotdPublishAction;
  clearAction: MotdClearAction;
  /** When true, show All Platform switch (platform admins only). */
  allowAllPlatformToggle?: boolean;
  publishPlatformAction?: MotdPublishAction;
  clearPlatformAction?: MotdClearAction;
  initialPlatform?: MotdAdminState | null;
}) {
  const [allPlatform, setAllPlatform] = useState(false);
  const [body, setBody] = useState("");
  const [endsLocal, setEndsLocal] = useState("");
  const [networkCurrent, setNetworkCurrent] = useState<MotdAdminState | null>(
    initial,
  );
  const [platformCurrent, setPlatformCurrent] = useState<MotdAdminState | null>(
    initialPlatform,
  );
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const platformMode =
    allowAllPlatformToggle &&
    allPlatform &&
    Boolean(publishPlatformAction) &&
    Boolean(clearPlatformAction);
  const activeScopeLabel = platformMode ? "Platform" : scopeLabel;
  const current = platformMode ? platformCurrent : networkCurrent;

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
      const action =
        platformMode && publishPlatformAction
          ? publishPlatformAction
          : publishAction;
      const result = await action({ body, endsAt });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      if (platformMode) {
        setPlatformCurrent(result.data);
      } else {
        setNetworkCurrent(result.data);
      }
      setBody("");
      setEndsLocal("");
      setMessage(`${activeScopeLabel} message published.`);
    });
  }

  function onClear() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const action =
        platformMode && clearPlatformAction
          ? clearPlatformAction
          : clearAction;
      const result = await action();
      if (!result.ok) {
        setError(result.message);
        return;
      }
      if (platformMode) {
        setPlatformCurrent(null);
      } else {
        setNetworkCurrent(null);
      }
      setMessage(`${activeScopeLabel} message cleared.`);
    });
  }

  return (
    <Stack spacing={1.5}>
      <Typography variant="subtitle1" component="h3">
        Message of the day
      </Typography>
      {allowAllPlatformToggle && (
        <FormControlLabel
          control={
            <Switch
              checked={allPlatform}
              onChange={(_, checked) => {
                setAllPlatform(checked);
                setError(null);
                setMessage(null);
              }}
              disabled={pending}
              inputProps={{ "aria-label": "All Platform" }}
            />
          }
          label="All Platform"
        />
      )}
      <Typography variant="body2" color="text.secondary">
        Active scope: {platformMode ? "All Platform" : scopeLabel}. Sends a
        pop-up to users on this {activeScopeLabel.toLowerCase()}. Max{" "}
        {MOTD_MAX_BODY_LENGTH} characters. Optional end date stops delivery
        after that time. Dismissing the pop-up acknowledges it once and keeps a
        copy in Notifications.
      </Typography>
      {current && (
        <Alert severity="info">
          Active ({platformMode ? "platform" : scopeLabel.toLowerCase()}):{" "}
          {current.body}
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
