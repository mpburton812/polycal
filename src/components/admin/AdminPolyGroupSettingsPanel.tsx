"use client";

import {
  Alert,
  Button,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  getPolyGroupSettingsAction,
  updatePolyGroupSettingsAction,
} from "@/actions/poly-group";
import type { PolyGroupSettings } from "@/types/poly-group";
import {
  auditLogVisibilityLevels,
  groupNameChangeModes,
  powerManagementModes,
} from "@/types/poly-group";

const GROUP_NAME_LABELS: Record<string, string> = {
  admin_only: "Admin only",
  mandatory_consensus: "Mandatory consensus",
  plurality: "Plurality of users",
  auto: "No votes required (automatic)",
};

const AUDIT_LABELS: Record<string, string> = {
  everyone: "Everyone",
  invitees_proposer_admin: "Invitees + proposer + admin",
  proposer_admin: "Proposer + admin",
  admin_only: "Admin only",
};

/**
 * Poly group settings editor for the Admin tab (PC-30).
 */
export function AdminPolyGroupSettingsPanel({
  initialSettings,
}: {
  initialSettings: PolyGroupSettings;
}) {
  const router = useRouter();
  const [settings, setSettings] = useState(initialSettings);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const result = await updatePolyGroupSettingsAction(settings);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setMessage(result.message);
      router.refresh();
    });
  }

  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h6" gutterBottom>
        Poly group settings
      </Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {message && <Alert severity="success" sx={{ mb: 2 }}>{message}</Alert>}
      <Stack spacing={2}>
        <TextField
          label="Poly group name"
          value={settings.name}
          onChange={(e) => setSettings({ ...settings, name: e.target.value })}
          fullWidth
        />
        <FormControlLabel
          control={
            <Switch
              checked={settings.allowGroupNameProposals}
              onChange={(e) =>
                setSettings({ ...settings, allowGroupNameProposals: e.target.checked })
              }
            />
          }
          label="Allow proposals to change group name"
        />
        <FormControl fullWidth>
          <InputLabel>Group name change mode</InputLabel>
          <Select
            label="Group name change mode"
            value={settings.groupNameChangeMode}
            onChange={(e) =>
              setSettings({
                ...settings,
                groupNameChangeMode: e.target.value as PolyGroupSettings["groupNameChangeMode"],
              })
            }
          >
            {groupNameChangeModes.map((mode) => (
              <MenuItem key={mode} value={mode}>
                {GROUP_NAME_LABELS[mode] ?? mode}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl fullWidth>
          <InputLabel>Power management</InputLabel>
          <Select
            label="Power management"
            value={settings.powerManagementMode}
            onChange={(e) =>
              setSettings({
                ...settings,
                powerManagementMode: e.target.value as PolyGroupSettings["powerManagementMode"],
              })
            }
          >
            <MenuItem value="admin_user">Admin / user levels</MenuItem>
            <MenuItem value="all_admin">All users as administrators</MenuItem>
          </Select>
        </FormControl>
        <Typography variant="subtitle2">Event privacy types</Typography>
        <FormControlLabel
          control={
            <Switch
              checked={settings.eventPrivacyOpen}
              onChange={(e) =>
                setSettings({ ...settings, eventPrivacyOpen: e.target.checked })
              }
            />
          }
          label="Open (default)"
        />
        <FormControlLabel
          control={
            <Switch
              checked={settings.eventPrivacyPrivate}
              onChange={(e) =>
                setSettings({ ...settings, eventPrivacyPrivate: e.target.checked })
              }
            />
          }
          label="Private"
        />
        <FormControlLabel
          control={
            <Switch
              checked={settings.eventPrivacySuperPrivate}
              onChange={(e) =>
                setSettings({ ...settings, eventPrivacySuperPrivate: e.target.checked })
              }
            />
          }
          label="Super private"
        />
        <FormControlLabel
          control={
            <Switch
              checked={settings.adminCanSeePrivate}
              onChange={(e) =>
                setSettings({ ...settings, adminCanSeePrivate: e.target.checked })
              }
            />
          }
          label="Admins can interact with private events"
        />
        <FormControlLabel
          control={
            <Switch
              checked={settings.adminCanSeeSuperPrivate}
              onChange={(e) =>
                setSettings({ ...settings, adminCanSeeSuperPrivate: e.target.checked })
              }
            />
          }
          label="Admins can interact with super-private events"
        />
        <FormControl fullWidth>
          <InputLabel>Proposal audit log visibility</InputLabel>
          <Select
            label="Proposal audit log visibility"
            value={settings.auditLogVisibility}
            onChange={(e) =>
              setSettings({
                ...settings,
                auditLogVisibility: e.target.value as PolyGroupSettings["auditLogVisibility"],
              })
            }
          >
            {auditLogVisibilityLevels.map((level) => (
              <MenuItem key={level} value={level}>
                {AUDIT_LABELS[level] ?? level}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControlLabel
          control={
            <Switch
              checked={settings.allowUserProvisioning}
              onChange={(e) =>
                setSettings({ ...settings, allowUserProvisioning: e.target.checked })
              }
            />
          }
          label="Any user can add people (not only admins)"
        />
        <FormControlLabel
          control={
            <Switch
              checked={settings.hideSleepingArrangements}
              onChange={(e) =>
                setSettings({ ...settings, hideSleepingArrangements: e.target.checked })
              }
            />
          }
          label="Hide sleeping arrangements from non-sleeping partners on calendar"
        />
        <TextField
          label="System log tail length"
          type="number"
          inputProps={{ min: 0, max: 1000 }}
          value={settings.logTailLength}
          onChange={(e) =>
            setSettings({
              ...settings,
              logTailLength: Math.min(1000, Math.max(0, Number(e.target.value) || 0)),
            })
          }
          helperText="0 hides the log; max 1000 entries"
        />
        <Button variant="contained" onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save settings"}
        </Button>
      </Stack>
    </Paper>
  );
}
