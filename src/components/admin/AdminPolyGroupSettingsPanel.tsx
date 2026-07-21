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

import { getPolyGroupSettingsAction, updatePolyGroupSettingsAction } from "@/actions/poly-group";
import { AdminCollapsibleSection } from "@/components/admin/AdminCollapsibleSection";
import { LONG_TEXT_MAX } from "@/lib/validation/string-limits";
import type { PolyGroupSettings } from "@/types/poly-group";
import { auditLogVisibilityLevels, placesMapVisibilityLevels } from "@/types/poly-group";

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
  const [savePending, startSaveTransition] = useTransition();

  function save() {
    setMessage(null);
    setError(null);
    startSaveTransition(async () => {
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
    <AdminCollapsibleSection title="Poly group settings">
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {message && <Alert severity="success" sx={{ mb: 2 }}>{message}</Alert>}
      <Stack spacing={2}>
        <TextField
          label="Poly group name"
          value={settings.name}
          onChange={(e) => setSettings({ ...settings, name: e.target.value })}
          fullWidth
          inputProps={{ maxLength: LONG_TEXT_MAX }}
        />
        <FormControlLabel
          control={
            <Switch
              checked={settings.adminCanSeeUninvolved}
              onChange={(e) =>
                setSettings({ ...settings, adminCanSeeUninvolved: e.target.checked })
              }
            />
          }
          label="Admins can see proposals they are not involved in"
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
          inputProps={{ maxLength: LONG_TEXT_MAX }}
          helperText="Shown to users when they finish first-login onboarding."
        />
        <Typography variant="subtitle2" sx={{ pt: 1 }}>
          Proposal enforcement
        </Typography>
        <TextField
          label="Max days in proposed"
          type="number"
          inputProps={{ min: 0, max: 365 }}
          value={settings.proposedMaxDays}
          onChange={(e) =>
            setSettings({
              ...settings,
              proposedMaxDays: Math.min(365, Math.max(0, Number(e.target.value) || 0)),
            })
          }
          helperText="0 = expire only when event start passes without resolution"
        />
        <TextField
          label="At-risk draft TTL (days)"
          type="number"
          inputProps={{ min: 1, max: 365 }}
          value={settings.atRiskTtlDays}
          onChange={(e) =>
            setSettings({
              ...settings,
              atRiskTtlDays: Math.min(365, Math.max(1, Number(e.target.value) || 1)),
            })
          }
          helperText="How long collision/re-draft drafts stay editable before archive"
        />
        <TextField
          label="Sleeping partner proposal TTL (days)"
          type="number"
          inputProps={{ min: 1, max: 365 }}
          value={settings.sleepingPartnerProposalMaxDays}
          onChange={(e) =>
            setSettings({
              ...settings,
              sleepingPartnerProposalMaxDays: Math.min(
                365,
                Math.max(1, Number(e.target.value) || 1),
              ),
            })
          }
          helperText="Unanswered sleeping-partner proposals are deleted after this many days; both people are notified"
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
        <Button variant="contained" onClick={save} disabled={savePending}>
          {savePending ? "Saving…" : "Save settings"}
        </Button>
      </Stack>
    </AdminCollapsibleSection>
  );
}
