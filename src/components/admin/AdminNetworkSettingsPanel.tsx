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

import { updateNetworkSettingsAction } from "@/actions/network-settings";
import { AdminCollapsibleSection } from "@/components/admin/AdminCollapsibleSection";
import { useToast } from "@/components/providers/ToastProvider";
import { LONG_TEXT_MAX } from "@/lib/validation/string-limits";
import type { NetworkSettings } from "@/types/network-settings";
import {
  auditLogVisibilityLevels,
  placesMapVisibilityLevels,
  proxySchedulingScopes,
  schedulingPostingModes,
} from "@/types/network-settings";

const AUDIT_LABELS: Record<string, string> = {
  everyone: "Everyone",
  invitees_proposer_admin: "Invitees + proposer + admin",
  proposer_admin: "Proposer + admin",
  admin_only: "Admin only",
};

const POSTING_LABELS: Record<string, string> = {
  proposals_only: "Just Proposals",
  proposals_and_schedule: "Proposals and Schedule",
};

const PROXY_SCOPE_LABELS: Record<string, string> = {
  anyone: "Anyone on this network",
  sleeping_partners: "Sleeping partners only",
};

const MAP_VISIBILITY_LABELS: Record<string, string> = {
  all: "Everyone",
  admins: "Admins only",
  none: "Hidden",
};

/**
 * Network settings editor for the Admin tab (PC-30).
 */
export function AdminNetworkSettingsPanel({
  initialSettings,
}: {
  initialSettings: NetworkSettings;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [settings, setSettings] = useState(initialSettings);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savePending, startSaveTransition] = useTransition();

  function save() {
    setMessage(null);
    setError(null);
    startSaveTransition(async () => {
      const result = await updateNetworkSettingsAction(settings);
      if (!result.ok) {
        setError(result.message);
        showToast(result.message, "error");
        return;
      }
      setMessage(result.message);
      showToast(result.message, "success");
      router.refresh();
    });
  }

  return (
    <AdminCollapsibleSection title="Network settings">
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {message && <Alert severity="success" sx={{ mb: 2 }}>{message}</Alert>}
      <Stack spacing={2}>
        <TextField
          label="Network name"
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
          <InputLabel id="proposal-audit-log-visibility-label">
            Proposal audit log visibility
          </InputLabel>
          <Select
            labelId="proposal-audit-log-visibility-label"
            id="proposal-audit-log-visibility"
            label="Proposal audit log visibility"
            value={settings.auditLogVisibility}
            onChange={(e) =>
              setSettings({
                ...settings,
                auditLogVisibility: e.target.value as NetworkSettings["auditLogVisibility"],
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
          label="Mask sleeping details for uninvolved admins on calendar"
        />
        <FormControlLabel
          control={
            <Switch
              checked={settings.seePartnersSleepingArrangements}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  seePartnersSleepingArrangements: e.target.checked,
                })
              }
            />
          }
          label="See partners' sleeping arrangements"
        />
        <Typography variant="caption" color="text.secondary" sx={{ mt: -1, display: "block" }}>
          When on, members see nights where an accepted sleeping partner is involved and they
          are not (shown in a lighter purple). Distinct from masking Busy details for uninvolved
          admins above.
        </Typography>
        <FormControlLabel
          control={
            <Switch
              checked={settings.fastSleepEnabled}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  fastSleepEnabled: e.target.checked,
                })
              }
            />
          }
          label="Enable FastSleep Proposal"
        />
        <Typography variant="caption" color="text.secondary" sx={{ mt: -1, display: "block" }}>
          When on, members can auto-schedule up to 14 nights for themselves and their sleeping
          partners&apos; arrangements without voting (FastSleep Proposal, PC-378).
        </Typography>
        <FormControlLabel
          control={
            <Switch
              checked={settings.feedEnabled}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  feedEnabled: e.target.checked,
                })
              }
            />
          }
          label="Enable Feed"
        />
        <Typography variant="caption" color="text.secondary" sx={{ mt: -1, display: "block" }}>
          When off, the Feed tab is hidden and members are redirected to Schedule (PC-385).
        </Typography>
        <FormControlLabel
          control={
            <Switch
              checked={settings.pollEnabled}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  pollEnabled: e.target.checked,
                })
              }
            />
          }
          label="Enable Poll"
        />
        <Typography variant="caption" color="text.secondary" sx={{ mt: -1, display: "block" }}>
          When off, Poll is hidden on new event proposals. Existing poll drafts are unchanged
          (PC-423).
        </Typography>
        {/* labelId so the combobox exposes "Proposal posting" to getByRole / getByLabel (PC-424). */}
        <FormControl fullWidth>
          <InputLabel id="proposal-posting-label">Proposal posting</InputLabel>
          <Select
            labelId="proposal-posting-label"
            id="proposal-posting"
            label="Proposal posting"
            value={settings.schedulingPosting}
            onChange={(e) =>
              setSettings({
                ...settings,
                schedulingPosting: e.target.value as NetworkSettings["schedulingPosting"],
                ...(e.target.value === "proposals_only"
                  ? { proxySchedulingEnabled: false }
                  : {}),
              })
            }
          >
            {schedulingPostingModes.map((mode) => (
              <MenuItem key={mode} value={mode}>
                {POSTING_LABELS[mode] ?? mode}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Typography variant="caption" color="text.secondary" sx={{ mt: -1, display: "block" }}>
          Proposals and Schedule adds a Proposal vs Schedule choice on the draft card. A
          schedule goes on the calendar with no approval votes (PC-424).
        </Typography>
        {settings.schedulingPosting === "proposals_and_schedule" ? (
          <>
            <FormControlLabel
              control={
                <Switch
                  checked={settings.proxySchedulingEnabled}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      proxySchedulingEnabled: e.target.checked,
                    })
                  }
                />
              }
              label="Proxy Scheduling"
            />
            <Typography variant="caption" color="text.secondary" sx={{ mt: -1, display: "block" }}>
              When on, Schedule mode can pick a person to schedule on behalf of (PC-425).
            </Typography>
            {settings.proxySchedulingEnabled ? (
              <FormControl fullWidth>
                <InputLabel id="proxy-for-label">Proxy for</InputLabel>
                <Select
                  labelId="proxy-for-label"
                  id="proxy-for"
                  label="Proxy for"
                  value={settings.proxySchedulingScope}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      proxySchedulingScope: e.target
                        .value as NetworkSettings["proxySchedulingScope"],
                    })
                  }
                >
                  {proxySchedulingScopes.map((scope) => (
                    <MenuItem key={scope} value={scope}>
                      {PROXY_SCOPE_LABELS[scope] ?? scope}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            ) : null}
          </>
        ) : null}
        <FormControl fullWidth>
          <InputLabel id="places-map-visibility-label">
            Sleeping Partners tab visibility
          </InputLabel>
          <Select
            labelId="places-map-visibility-label"
            id="places-map-visibility"
            label="Sleeping Partners tab visibility"
            value={settings.placesMapVisibility}
            onChange={(e) =>
              setSettings({
                ...settings,
                placesMapVisibility: e.target.value as NetworkSettings["placesMapVisibility"],
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
