"use client";

import {
  Alert,
  Avatar,
  Box,
  Button,
  Checkbox,
  FormControl,
  FormControlLabel,
  FormGroup,
  FormLabel,
  Paper,
  Radio,
  RadioGroup,
  Stack,
  Step,
  StepLabel,
  Stepper,
  TextField,
  Typography,
} from "@mui/material";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useState, useTransition } from "react";

import { completeOnboardingAction, saveOnboardingPreferencesAction } from "@/actions/onboarding";
import { proposePartnershipAction } from "@/actions/partnerships";
import {
  changePasswordAction,
  setInitialPasswordAction,
  updateNotificationPrefsAction,
} from "@/actions/profile";
import { AVATAR_OPTIONS } from "@/lib/constants/avatars";
import {
  USER_THEME_IDS,
  USER_THEME_LABELS,
  type UserThemeId,
} from "@/lib/constants/themes";
import {
  DEFAULT_NOTIFICATION_PREFS,
  type NotificationPrefs,
} from "@/types/notification-prefs";

interface PartnerOption {
  id: string;
  displayName: string;
}

const STEPS = ["Password", "Avatar & theme", "Sleeping partners", "Notifications", "Welcome"];

/**
 * Multi-step first-login onboarding per spec §4 (PC-10).
 */
export function FirstLoginWizard({
  mustChangePassword,
  initialAvatarKey,
  initialTheme,
  partnerOptions,
}: {
  mustChangePassword: boolean;
  initialAvatarKey: string | null;
  initialTheme: string;
  partnerOptions: PartnerOption[];
}) {
  const router = useRouter();
  const { update } = useSession();
  const startStep = mustChangePassword ? 0 : 1;
  const [activeStep, setActiveStep] = useState(startStep);
  const [error, setError] = useState<string | null>(null);
  const [avatarKey, setAvatarKey] = useState(initialAvatarKey ?? "bird_blue");
  const [theme, setTheme] = useState<UserThemeId>(
    (USER_THEME_IDS.includes(initialTheme as UserThemeId)
      ? initialTheme
      : "mint") as UserThemeId,
  );
  const [selectedPartners, setSelectedPartners] = useState<string[]>([]);
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_NOTIFICATION_PREFS);
  const [welcomeMessage, setWelcomeMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handlePasswordSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = mustChangePassword
        ? await setInitialPasswordAction(formData)
        : await changePasswordAction(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      await update({ user: { mustChangePassword: false } });
      setActiveStep(1);
      router.refresh();
    });
  }

  function saveAvatarAndTheme() {
    setError(null);
    startTransition(async () => {
      const result = await saveOnboardingPreferencesAction({ avatarKey, theme });
      if (!result.ok) {
        setError(result.error ?? "Could not save preferences.");
        return;
      }
      await update({ user: { avatarKey, theme } });
      setActiveStep(2);
    });
  }

  function savePartners() {
    setError(null);
    startTransition(async () => {
      for (const partnerId of selectedPartners) {
        await proposePartnershipAction(partnerId);
      }
      setActiveStep(3);
    });
  }

  function finishOnboarding() {
    setError(null);
    startTransition(async () => {
      const prefsResult = await updateNotificationPrefsAction(prefs);
      if (!prefsResult.ok) {
        setError(prefsResult.error);
        return;
      }
      const result = await completeOnboardingAction();
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setWelcomeMessage(result.welcomeMessage ?? null);
      setActiveStep(4);
    });
  }

  function enterApp() {
    startTransition(async () => {
      await update({ user: { onboardingComplete: true } });
      router.refresh();
    });
  }

  if (welcomeMessage !== null && activeStep === 4) {
    return (
      <Paper sx={{ p: 3, maxWidth: 640, mx: "auto" }}>
        <Typography variant="h5" component="h1" gutterBottom>
          Welcome!
        </Typography>
        <Typography sx={{ mb: 3, whiteSpace: "pre-wrap" }}>{welcomeMessage}</Typography>
        <Button variant="contained" onClick={enterApp} disabled={pending}>
          {pending ? "Loading…" : "Get started"}
        </Button>
      </Paper>
    );
  }

  return (
    <Paper sx={{ p: 3, maxWidth: 640, mx: "auto" }}>
      <Typography variant="h5" component="h1" gutterBottom>
        Welcome to PolyCal
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Complete these steps before using the app.
      </Typography>
      <Stepper activeStep={activeStep} sx={{ mb: 3 }}>
        {STEPS.map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {activeStep === 0 && (
        <Box component="form" onSubmit={handlePasswordSubmit}>
          <Stack spacing={2}>
            {!mustChangePassword && (
              <TextField
                name="currentPassword"
                label="Current password"
                type="password"
                required
                fullWidth
              />
            )}
            <TextField
              name="newPassword"
              label="New password"
              type="password"
              required
              fullWidth
              helperText="At least 8 characters"
            />
            <TextField
              name="confirmPassword"
              label="Confirm new password"
              type="password"
              required
              fullWidth
            />
            <Button type="submit" variant="contained" disabled={pending}>
              Continue
            </Button>
          </Stack>
        </Box>
      )}

      {activeStep === 1 && (
        <Stack spacing={2}>
          <FormControl component="fieldset">
            <FormLabel component="legend">Avatar</FormLabel>
            <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mt: 1 }}>
              {AVATAR_OPTIONS.map((option) => (
                <Button
                  key={option.key}
                  variant={avatarKey === option.key ? "contained" : "outlined"}
                  onClick={() => setAvatarKey(option.key)}
                  sx={{ minWidth: 72, p: 1 }}
                >
                  <Avatar src={option.src} alt={option.label} sx={{ width: 40, height: 40 }} />
                </Button>
              ))}
            </Stack>
          </FormControl>
          <FormControl component="fieldset">
            <FormLabel component="legend">Accent theme</FormLabel>
            <RadioGroup value={theme} onChange={(e) => setTheme(e.target.value as UserThemeId)}>
              {USER_THEME_IDS.map((id) => (
                <FormControlLabel
                  key={id}
                  value={id}
                  control={<Radio />}
                  label={USER_THEME_LABELS[id]}
                />
              ))}
            </RadioGroup>
          </FormControl>
          <Button variant="contained" onClick={saveAvatarAndTheme} disabled={pending}>
            Continue
          </Button>
        </Stack>
      )}

      {activeStep === 2 && (
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            Select sleeping partners to propose relationships with. Passive profiles are
            established automatically; active users receive a proposal.
          </Typography>
          <FormGroup>
            {partnerOptions.map((partner) => (
              <FormControlLabel
                key={partner.id}
                control={
                  <Checkbox
                    checked={selectedPartners.includes(partner.id)}
                    onChange={(e) => {
                      setSelectedPartners((prev) =>
                        e.target.checked
                          ? [...prev, partner.id]
                          : prev.filter((id) => id !== partner.id),
                      );
                    }}
                  />
                }
                label={partner.displayName}
              />
            ))}
          </FormGroup>
          {partnerOptions.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              No other users yet — you can add partners later in People &amp; Places.
            </Typography>
          )}
          <Button variant="contained" onClick={savePartners} disabled={pending}>
            Continue
          </Button>
        </Stack>
      )}

      {activeStep === 3 && (
        <Stack spacing={2}>
          <FormControlLabel
            control={
              <Checkbox
                checked={prefs.globalEnabled}
                onChange={(e) => setPrefs({ ...prefs, globalEnabled: e.target.checked })}
              />
            }
            label="Enable notifications"
          />
          <Typography variant="subtitle2">Channels</Typography>
          <FormGroup>
            <FormControlLabel
              control={
                <Checkbox
                  checked={prefs.channels.inApp}
                  onChange={(e) =>
                    setPrefs({
                      ...prefs,
                      channels: { ...prefs.channels, inApp: e.target.checked },
                    })
                  }
                />
              }
              label="In-app inbox"
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={prefs.channels.email}
                  onChange={(e) =>
                    setPrefs({
                      ...prefs,
                      channels: { ...prefs.channels, email: e.target.checked },
                    })
                  }
                />
              }
              label="Email (sends verification link when Resend is configured)"
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={prefs.channels.sms}
                  onChange={(e) =>
                    setPrefs({
                      ...prefs,
                      channels: { ...prefs.channels, sms: e.target.checked },
                    })
                  }
                />
              }
              label="SMS (coming in a later release)"
            />
          </FormGroup>
          <Typography variant="subtitle2">Alert types</Typography>
          <FormGroup>
            {(
              [
                ["sleepingProposals", "Sleeping Proposals"],
                ["eventProposals", "Event Proposals"],
                ["sleepingPartnerProposals", "Sleeping Partner Proposals"],
                ["reminders", "Reminders"],
              ] as const
            ).map(([key, label]) => (
              <FormControlLabel
                key={key}
                control={
                  <Checkbox
                    checked={prefs.alertTypes[key]}
                    onChange={(e) =>
                      setPrefs({
                        ...prefs,
                        alertTypes: { ...prefs.alertTypes, [key]: e.target.checked },
                      })
                    }
                  />
                }
                label={label}
              />
            ))}
          </FormGroup>
          <Button variant="contained" onClick={finishOnboarding} disabled={pending}>
            Finish setup
          </Button>
        </Stack>
      )}
    </Paper>
  );
}
