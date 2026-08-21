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
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";

import {
  reactivateNetworkAction,
  requestNetworkDeleteAction,
} from "@/actions/networks";
import { updateNetworkSettingsAction } from "@/actions/network-settings";
import { AdminCollapsibleSection } from "@/components/admin/AdminCollapsibleSection";
import { useToast } from "@/components/providers/ToastProvider";
import { LONG_TEXT_MAX } from "@/lib/validation/string-limits";
import type { NetworkSettings } from "@/types/network-settings";
import {
  auditLogVisibilityLevels,
  bookingsEnabled,
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
  proposals_and_bookings: "Proposals and Bookings",
  bookings_only: "Just Bookings",
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

const TEXT_DEBOUNCE_MS = 400;

function SettingsSubsection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Stack spacing={2}>
      <Typography variant="subtitle2" component="h3" sx={{ pt: 1 }}>
        {title}
      </Typography>
      {children}
    </Stack>
  );
}

/**
 * Network Configuration editor — switches persist immediately; text/number persist
 * on blur, Enter, and a short debounce (PC-461). Sponsor danger zone is PC-462.
 */
export function AdminNetworkSettingsPanel({
  initialSettings,
  isSponsor = false,
  networkStatus = "active",
  pendingDeleteAt = null,
}: {
  initialSettings: NetworkSettings;
  isSponsor?: boolean;
  networkStatus?: string;
  pendingDeleteAt?: string | null;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [settings, setSettings] = useState(initialSettings);
  const lastSaved = useRef(initialSettings);
  const debounceTimers = useRef<Partial<Record<keyof NetworkSettings, ReturnType<typeof setTimeout>>>>(
    {},
  );
  const [error, setError] = useState<string | null>(null);
  const [, startSaveTransition] = useTransition();
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deletePending, startDeleteTransition] = useTransition();

  useEffect(() => {
    setSettings(initialSettings);
    lastSaved.current = initialSettings;
  }, [initialSettings]);

  function revertKey<K extends keyof NetworkSettings>(key: K) {
    setSettings((current) => ({ ...current, [key]: lastSaved.current[key] }));
  }

  function persistPatch(patch: Partial<NetworkSettings>, revertKeys: (keyof NetworkSettings)[]) {
    setError(null);
    startSaveTransition(async () => {
      const result = await updateNetworkSettingsAction(patch);
      if (!result.ok) {
        setError(result.message);
        showToast(result.message, "error");
        for (const key of revertKeys) revertKey(key);
        return;
      }
      lastSaved.current = { ...lastSaved.current, ...patch };
      showToast(result.message, "success");
    });
  }

  function persistImmediate<K extends keyof NetworkSettings>(key: K, value: NetworkSettings[K]) {
    const next = { ...settings, [key]: value };
    if (key === "schedulingPosting") {
      const mode = value as NetworkSettings["schedulingPosting"];
      next.proxySchedulingEnabled = bookingsEnabled(mode);
      next.pollEnabled = mode === "bookings_only" ? false : settings.pollEnabled;
    }
    setSettings(next);
    persistPatch(
      key === "schedulingPosting"
        ? {
            schedulingPosting: value as NetworkSettings["schedulingPosting"],
            proxySchedulingEnabled: next.proxySchedulingEnabled,
            pollEnabled: next.pollEnabled,
          }
        : { [key]: value },
      key === "schedulingPosting"
        ? ["schedulingPosting", "proxySchedulingEnabled", "pollEnabled"]
        : [key],
    );
  }

  function persistText<K extends keyof NetworkSettings>(key: K, value: NetworkSettings[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
    const existing = debounceTimers.current[key];
    if (existing) clearTimeout(existing);
    debounceTimers.current[key] = setTimeout(() => {
      persistPatch({ [key]: value } as Partial<NetworkSettings>, [key]);
    }, TEXT_DEBOUNCE_MS);
  }

  function flushText<K extends keyof NetworkSettings>(key: K, value: NetworkSettings[K]) {
    const existing = debounceTimers.current[key];
    if (existing) clearTimeout(existing);
    if (lastSaved.current[key] === value) return;
    persistPatch({ [key]: value } as Partial<NetworkSettings>, [key]);
  }

  const closing = networkStatus === "pending_delete";

  return (
    <AdminCollapsibleSection title="Network Configuration">
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {closing && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          This network is scheduled to close
          {pendingDeleteAt ? ` at ${new Date(pendingDeleteAt).toLocaleString()}` : ""}.
        </Alert>
      )}
      <Stack spacing={2}>
        <TextField
          label="Network name"
          value={settings.name}
          onChange={(e) => persistText("name", e.target.value)}
          onBlur={(e) => flushText("name", e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              flushText("name", settings.name);
            }
          }}
          fullWidth
          inputProps={{ maxLength: LONG_TEXT_MAX }}
        />

        <SettingsSubsection title="Network Systems">
          <FormControlLabel
            control={
              <Switch
                checked={settings.feedEnabled}
                onChange={(e) => persistImmediate("feedEnabled", e.target.checked)}
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
                checked={settings.schedulingPosting !== "bookings_only" && settings.pollEnabled}
                disabled={settings.schedulingPosting === "bookings_only"}
                onChange={(e) => persistImmediate("pollEnabled", e.target.checked)}
              />
            }
            label="Enable Poll"
          />
          <Typography variant="caption" color="text.secondary" sx={{ mt: -1, display: "block" }}>
            When off, Poll is hidden on new event proposals. Existing poll drafts are unchanged
            (PC-423). Just Bookings turns Poll off automatically (PC-447).
          </Typography>
          <FormControlLabel
            control={
              <Switch
                checked={settings.fastSleepEnabled}
                onChange={(e) => persistImmediate("fastSleepEnabled", e.target.checked)}
              />
            }
            label="Enable Bulk Sleeping Booking"
          />
          <Typography variant="caption" color="text.secondary" sx={{ mt: -1, display: "block" }}>
            When on, members can auto-schedule up to 14 nights for themselves and their sleeping
            partners&apos; arrangements without voting (FastSleep Proposal, PC-378).
          </Typography>
          <FormControl fullWidth>
            <InputLabel id="places-map-visibility-label">
              Sleeping partner tab visibility
            </InputLabel>
            <Select
              labelId="places-map-visibility-label"
              id="places-map-visibility"
              label="Sleeping partner tab visibility"
              value={settings.placesMapVisibility}
              onChange={(e) =>
                persistImmediate(
                  "placesMapVisibility",
                  e.target.value as NetworkSettings["placesMapVisibility"],
                )
              }
            >
              {placesMapVisibilityLevels.map((level) => (
                <MenuItem key={level} value={level}>
                  {MAP_VISIBILITY_LABELS[level] ?? level}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </SettingsSubsection>

        <SettingsSubsection title="Proposals and Bookings">
          <FormControlLabel
            control={
              <Switch
                checked={settings.adminCanSeeUninvolved}
                onChange={(e) => persistImmediate("adminCanSeeUninvolved", e.target.checked)}
              />
            }
            label="Admins can see proposals they are not involved in"
          />
          <FormControl fullWidth>
            <InputLabel id="proposal-posting-label">Event Types</InputLabel>
            <Select
              labelId="proposal-posting-label"
              id="proposal-posting"
              label="Event Types"
              value={settings.schedulingPosting}
              onChange={(e) =>
                persistImmediate(
                  "schedulingPosting",
                  e.target.value as NetworkSettings["schedulingPosting"],
                )
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
            Proposals and Bookings adds a Proposal or Booking choice on the draft card. A
            booking goes on the calendar with no approval votes. Just Bookings always books and
            turns Poll off (PC-447). Sleeping-partner and residency proposals are unchanged.
          </Typography>
          {bookingsEnabled(settings.schedulingPosting) ? (
            <FormControl fullWidth>
              <InputLabel id="proxy-for-label">Booking for</InputLabel>
              <Select
                labelId="proxy-for-label"
                id="proxy-for"
                label="Booking for"
                value={settings.proxySchedulingScope}
                onChange={(e) =>
                  persistImmediate(
                    "proxySchedulingScope",
                    e.target.value as NetworkSettings["proxySchedulingScope"],
                  )
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
                persistImmediate(
                  "auditLogVisibility",
                  e.target.value as NetworkSettings["auditLogVisibility"],
                )
              }
            >
              {auditLogVisibilityLevels.map((level) => (
                <MenuItem key={level} value={level}>
                  {AUDIT_LABELS[level] ?? level}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </SettingsSubsection>

        <SettingsSubsection title="Proposal enforcement">
          <TextField
            label="Max days in proposed"
            type="number"
            inputProps={{ min: 0, max: 365 }}
            value={settings.proposedMaxDays}
            onChange={(e) =>
              persistText(
                "proposedMaxDays",
                Math.min(365, Math.max(0, Number(e.target.value) || 0)),
              )
            }
            onBlur={(e) =>
              flushText(
                "proposedMaxDays",
                Math.min(365, Math.max(0, Number(e.target.value) || 0)),
              )
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                flushText("proposedMaxDays", settings.proposedMaxDays);
              }
            }}
            helperText="0 = expire only when event start passes without resolution"
          />
          <TextField
            label="At-risk draft TTL (days)"
            type="number"
            inputProps={{ min: 1, max: 365 }}
            value={settings.atRiskTtlDays}
            onChange={(e) =>
              persistText(
                "atRiskTtlDays",
                Math.min(365, Math.max(1, Number(e.target.value) || 1)),
              )
            }
            onBlur={(e) =>
              flushText(
                "atRiskTtlDays",
                Math.min(365, Math.max(1, Number(e.target.value) || 1)),
              )
            }
            helperText="How long collision/re-draft drafts stay editable before archive"
          />
          <TextField
            label="Sleeping partner proposal TTL (days)"
            type="number"
            inputProps={{ min: 1, max: 365 }}
            value={settings.sleepingPartnerProposalMaxDays}
            onChange={(e) =>
              persistText(
                "sleepingPartnerProposalMaxDays",
                Math.min(365, Math.max(1, Number(e.target.value) || 1)),
              )
            }
            onBlur={(e) =>
              flushText(
                "sleepingPartnerProposalMaxDays",
                Math.min(365, Math.max(1, Number(e.target.value) || 1)),
              )
            }
            helperText="Unanswered sleeping-partner proposals are deleted after this many days; both people are notified"
          />
          <TextField
            label="Archive grace (hours after end)"
            type="number"
            inputProps={{ min: 0, max: 8760 }}
            value={settings.archiveGraceHours}
            onChange={(e) =>
              persistText(
                "archiveGraceHours",
                Math.min(8760, Math.max(0, Number(e.target.value) || 0)),
              )
            }
            onBlur={(e) =>
              flushText(
                "archiveGraceHours",
                Math.min(8760, Math.max(0, Number(e.target.value) || 0)),
              )
            }
            helperText="Resolved events auto-archive this many hours after scheduled end"
          />
          <TextField
            label="Redraft deadline (hours before start)"
            type="number"
            inputProps={{ min: 1, max: 168 }}
            value={settings.redraftDeadlineHours}
            onChange={(e) =>
              persistText(
                "redraftDeadlineHours",
                Math.min(168, Math.max(1, Number(e.target.value) || 1)),
              )
            }
            onBlur={(e) =>
              flushText(
                "redraftDeadlineHours",
                Math.min(168, Math.max(1, Number(e.target.value) || 1)),
              )
            }
            helperText="At-risk resolved events return to proposed within this window"
          />
        </SettingsSubsection>

        <SettingsSubsection title="Members & privacy">
          <FormControlLabel
            control={
              <Switch
                checked={settings.allowUserProvisioning}
                onChange={(e) => persistImmediate("allowUserProvisioning", e.target.checked)}
              />
            }
            label="Any user can add people (not only admins)"
          />
          <FormControlLabel
            control={
              <Switch
                checked={settings.hideSleepingArrangements}
                onChange={(e) => persistImmediate("hideSleepingArrangements", e.target.checked)}
              />
            }
            label="Mask sleeping details for uninvolved admins on calendar"
          />
          <FormControlLabel
            control={
              <Switch
                checked={settings.seePartnersSleepingArrangements}
                onChange={(e) =>
                  persistImmediate("seePartnersSleepingArrangements", e.target.checked)
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
        </SettingsSubsection>

        <SettingsSubsection title="Onboarding & logs">
          <TextField
            label="System log tail length"
            type="number"
            inputProps={{ min: 0, max: 1000 }}
            value={settings.logTailLength}
            onChange={(e) =>
              persistText(
                "logTailLength",
                Math.min(1000, Math.max(0, Number(e.target.value) || 0)),
              )
            }
            onBlur={(e) =>
              flushText(
                "logTailLength",
                Math.min(1000, Math.max(0, Number(e.target.value) || 0)),
              )
            }
            helperText="0 hides the log; max 1000 entries"
          />
          <TextField
            label="First-login welcome message"
            value={settings.onboardingWelcomeMessage}
            onChange={(e) => persistText("onboardingWelcomeMessage", e.target.value)}
            onBlur={(e) => flushText("onboardingWelcomeMessage", e.target.value)}
            multiline
            minRows={4}
            fullWidth
            inputProps={{ maxLength: LONG_TEXT_MAX }}
            helperText="Shown to users when they finish first-login onboarding."
          />
        </SettingsSubsection>

        {isSponsor && (
          <SettingsSubsection title="Danger zone">
            {closing ? (
              <Button
                color="success"
                variant="contained"
                disabled={deletePending}
                onClick={() =>
                  startDeleteTransition(async () => {
                    const result = await reactivateNetworkAction();
                    showToast(result.message, result.ok ? "success" : "error");
                    if (result.ok) router.refresh();
                  })
                }
              >
                Re-activate network
              </Button>
            ) : (
              <>
                <Typography variant="body2" color="error">
                  Closing this network locks everyone except you for 24 hours, then permanently
                  deletes network data. Type DELETE to confirm.
                </Typography>
                <TextField
                  label="Type DELETE to close this network"
                  value={deleteConfirm}
                  onChange={(e) => setDeleteConfirm(e.target.value)}
                  inputProps={{ "aria-label": "Type DELETE to close this network" }}
                />
                <Button
                  color="error"
                  variant="contained"
                  disabled={deletePending || deleteConfirm !== "DELETE"}
                  onClick={() =>
                    startDeleteTransition(async () => {
                      const result = await requestNetworkDeleteAction(deleteConfirm);
                      showToast(result.message, result.ok ? "success" : "error");
                      if (result.ok) {
                        setDeleteConfirm("");
                        router.refresh();
                      }
                    })
                  }
                >
                  Close network
                </Button>
              </>
            )}
          </SettingsSubsection>
        )}
      </Stack>
    </AdminCollapsibleSection>
  );
}
