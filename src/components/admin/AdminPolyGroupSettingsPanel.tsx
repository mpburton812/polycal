"use client";

import {
  Alert,
  Button,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
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
  proposeGroupNameChangeAction,
  updatePolyGroupSettingsAction,
} from "@/actions/poly-group";
import { AdminCollapsibleSection } from "@/components/admin/AdminCollapsibleSection";
import type { PolyGroupSettings } from "@/types/poly-group";
import {
  auditLogVisibilityLevels,
  groupNameChangeModes,
  placesMapVisibilityLevels,
  powerManagementModes,
  sleepingNetworkVisibilityLevels,
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

const MAP_VISIBILITY_LABELS: Record<string, string> = {
  all: "Everyone",
  admins: "Admins only",
  none: "Hidden",
};

const SLEEPING_NETWORK_LABELS: Record<string, string> = {
  everyone: "Visible to whole network (subject to private/super-private)",
  involved: "Only people involved (proposer, invitees, admins)",
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
  const [proposedName, setProposedName] = useState("");
  const [proposalMessage, setProposalMessage] = useState<string | null>(null);
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

  function proposeNameChange() {
    setProposalMessage(null);
    setError(null);
    startTransition(async () => {
      const result = await proposeGroupNameChangeAction({ proposedName });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setProposalMessage(result.message);
      setProposedName("");
      if (result.proposalId) {
        router.push(`/proposals?open=${encodeURIComponent(result.proposalId)}`);
      }
      router.refresh();
    });
  }

  return (
    <AdminCollapsibleSection title="Poly group settings">
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {message && <Alert severity="success" sx={{ mb: 2 }}>{message}</Alert>}
      <Stack spacing={2}>
        <TextField
          label="Poly group name"
          value={settings.name}
          onChange={(e) => setSettings({ ...settings, name: e.target.value })}
          fullWidth
          helperText={
            settings.allowGroupNameProposals
              ? "Direct saves update immediately; use “Propose name change” for consensus workflow."
              : undefined
          }
        />
        {settings.allowGroupNameProposals && (
          <Stack direction="row" spacing={2} alignItems="flex-start">
            <TextField
              label="Proposed new name"
              value={proposedName}
              onChange={(e) => setProposedName(e.target.value)}
              fullWidth
            />
            <Button
              variant="outlined"
              onClick={proposeNameChange}
              disabled={pending || !proposedName.trim()}
            >
              Propose name change (draft)
            </Button>
          </Stack>
        )}
        {proposalMessage && <Alert severity="success">{proposalMessage}</Alert>}
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
        <FormControl fullWidth>
          <InputLabel>Sleeping proposals network visibility</InputLabel>
          <Select
            label="Sleeping proposals network visibility"
            value={settings.sleepingNetworkVisibility}
            onChange={(e) =>
              setSettings({
                ...settings,
                sleepingNetworkVisibility:
                  e.target.value as PolyGroupSettings["sleepingNetworkVisibility"],
              })
            }
          >
            {sleepingNetworkVisibilityLevels.map((level) => (
              <MenuItem key={level} value={level}>
                {SLEEPING_NETWORK_LABELS[level] ?? level}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl fullWidth>
          <InputLabel>Sleeping Partners tab visibility</InputLabel>
          <Select
            label="Sleeping Partners tab visibility"
            value={settings.placesMapVisibility}
            onChange={(e) =>
              setSettings({
                ...settings,
                placesMapVisibility: e.target.value as PolyGroupSettings["placesMapVisibility"],
              })
            }
          >
            {placesMapVisibilityLevels.map((level) => (
              <MenuItem key={level} value={level}>
                {MAP_VISIBILITY_LABELS[level] ?? level}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
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
        <TextField
          label="First-login welcome message"
          value={settings.onboardingWelcomeMessage}
          onChange={(e) =>
            setSettings({ ...settings, onboardingWelcomeMessage: e.target.value })
          }
          multiline
          minRows={4}
          fullWidth
          helperText="Shown to users when they finish first-login onboarding."
        />
        <Typography variant="subtitle2" sx={{ pt: 1 }}>
          Proposal enforcement
        </Typography>
        <TextField
          label="Max hours in proposed"
          type="number"
          inputProps={{ min: 0, max: 8760 }}
          value={settings.proposedMaxHours}
          onChange={(e) =>
            setSettings({
              ...settings,
              proposedMaxHours: Math.min(8760, Math.max(0, Number(e.target.value) || 0)),
            })
          }
          helperText="0 = expire only when event start passes without resolution"
        />
        <TextField
          label="At-risk draft TTL (hours)"
          type="number"
          inputProps={{ min: 1, max: 8760 }}
          value={settings.atRiskTtlHours}
          onChange={(e) =>
            setSettings({
              ...settings,
              atRiskTtlHours: Math.min(8760, Math.max(1, Number(e.target.value) || 1)),
            })
          }
          helperText="How long collision/re-draft drafts stay editable before archive"
        />
        <TextField
          label="Archive grace (hours after end)"
          type="number"
          inputProps={{ min: 0, max: 8760 }}
          value={settings.archiveGraceHours}
          onChange={(e) =>
            setSettings({
              ...settings,
              archiveGraceHours: Math.min(8760, Math.max(0, Number(e.target.value) || 0)),
            })
          }
          helperText="Resolved events auto-archive this many hours after scheduled end"
        />
        <TextField
          label="Redraft deadline (hours before start)"
          type="number"
          inputProps={{ min: 1, max: 168 }}
          value={settings.redraftDeadlineHours}
          onChange={(e) =>
            setSettings({
              ...settings,
              redraftDeadlineHours: Math.min(168, Math.max(1, Number(e.target.value) || 1)),
            })
          }
          helperText="At-risk resolved events return to proposed within this window"
        />
        <TextField
          label="Missing-invitee recovery (hours)"
          type="number"
          inputProps={{ min: 1, max: 8760 }}
          value={settings.recoveryMaxHours}
          onChange={(e) =>
            setSettings({
              ...settings,
              recoveryMaxHours: Math.min(8760, Math.max(1, Number(e.target.value) || 1)),
            })
          }
          helperText="Resolved events hold calendar this long when all required invitees are removed"
        />
        <Button variant="contained" onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save settings"}
        </Button>
      </Stack>
    </AdminCollapsibleSection>
  );
}
