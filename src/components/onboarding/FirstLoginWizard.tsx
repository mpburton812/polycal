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
  InputLabel,
  Link as MuiLink,
  MenuItem,
  Paper,
  Select,
  Stack,
  Step,
  StepLabel,
  Stepper,
  TextField,
  Typography,
} from "@mui/material";
import NextLink from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Suspense, useEffect, useState, useTransition } from "react";

import { completeOnboardingAction, prepareOnboardingWelcomeAction, saveOnboardingPreferencesAction } from "@/actions/onboarding";
import { proposePartnershipAction } from "@/actions/partnerships";
import {
  changePasswordAction,
  setInitialPasswordAction,
  updateNotificationEmailAction,
  updateNotificationPrefsAction,
} from "@/actions/profile";
import { CalendarIntegrationSettings } from "@/components/profile/CalendarIntegrationSettings";
import { AVATAR_OPTIONS } from "@/lib/constants/avatars";
import { ThemeAccentPicker } from "@/components/ui/ThemeAccentPicker";
import { normalizeUserThemeId, type UserThemeId } from "@/lib/constants/themes";
import {
  COMMON_TIMEZONES,
  DEFAULT_VIEWER_TIMEZONE,
} from "@/lib/schedule/timezone";
import { PROFILE_BIO_MAX_LENGTH } from "@/lib/users/profile-bio";
import { brutalPaperSx } from "@/theme/brutalUi";
import { fontFamilies } from "@/theme/fonts";
import { GARDEN_TOKENS } from "@/theme/tokens";
import {
  DEFAULT_NOTIFICATION_PREFS,
  type NotificationPrefs,
} from "@/types/notification-prefs";
import {
  ONBOARDING_STEP_STORAGE_KEY,
  resolveOnboardingStartStep,
} from "@/lib/onboarding/wizard-step";

interface PartnerOption {
  id: string;
  displayName: string;
}

const STEPS = [
  "Password",
  "Avatar & theme",
  "Sleeping partners",
  "Notifications",
  "Calendar",
  "Welcome",
];

/**
 * Multi-step first-login onboarding per spec §4 (PC-10 / PC-194).
 * Suspense wraps useSearchParams for the OAuth Calendar restore path (PC-348).
 */
export function FirstLoginWizard(props: {
  mustChangePassword: boolean;
  initialAvatarKey: string | null;
  initialTheme: string;
  partnerOptions: PartnerOption[];
}) {
  return (
    <Suspense
      fallback={
        <Paper elevation={0} sx={{ ...brutalPaperSx, maxWidth: 640, mx: "auto" }}>
          <Typography variant="body2">Loading setup…</Typography>
        </Paper>
      }
    >
      <FirstLoginWizardInner {...props} />
    </Suspense>
  );
}

function FirstLoginWizardInner({
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
  const searchParams = useSearchParams();
  const { update } = useSession();
  // SSR-safe default; OAuth remount restores Calendar via effect + sessionStorage (PC-348).
  const [activeStep, setActiveStep] = useState(mustChangePassword ? 0 : 1);
  const [stepRestored, setStepRestored] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avatarKey, setAvatarKey] = useState(initialAvatarKey ?? "bird_blue");
  const [theme, setTheme] = useState<UserThemeId>(normalizeUserThemeId(initialTheme));
  const [profileBio, setProfileBio] = useState("");
  const [timezone, setTimezone] = useState(DEFAULT_VIEWER_TIMEZONE);
  const [selectedPartners, setSelectedPartners] = useState<string[]>([]);
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_NOTIFICATION_PREFS);
  const [notificationEmail, setNotificationEmail] = useState("");
  const [emailStatus, setEmailStatus] = useState<string | null>(null);
  const [welcomeMessage, setWelcomeMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (stepRestored) return;
    let storedStep: string | null = null;
    try {
      storedStep = window.sessionStorage.getItem(ONBOARDING_STEP_STORAGE_KEY);
    } catch {
      storedStep = null;
    }
    const queryStep = searchParams.get("onboardingStep");
    const next = resolveOnboardingStartStep({
      mustChangePassword,
      queryStep,
      storedStep,
    });
    setActiveStep(next);
    setStepRestored(true);
    // Drop one-shot query after restore so refresh does not stick on Calendar.
    if (queryStep) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("onboardingStep");
      const qs = params.toString();
      router.replace(qs ? `/feed?${qs}` : "/feed");
    }
  }, [mustChangePassword, searchParams, stepRestored, router]);

  useEffect(() => {
    if (!stepRestored) return;
    try {
      window.sessionStorage.setItem(ONBOARDING_STEP_STORAGE_KEY, String(activeStep));
    } catch {
      // sessionStorage may be unavailable in private mode — ignore.
    }
  }, [activeStep, stepRestored]);

  function handlePasswordSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = mustChangePassword
        ? await setInitialPasswordAction(formData)
        : await changePasswordAction(formData);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      await update({
        user: {
          mustChangePassword: false,
          sessionVersion: result.sessionVersion,
        },
      });
      setActiveStep(1);
      router.refresh();
    });
  }

  function saveAvatarAndTheme() {
    setError(null);
    startTransition(async () => {
      const result = await saveOnboardingPreferencesAction({
        avatarKey,
        theme,
        timezone,
        profileBio,
      });
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

  function saveNotifications() {
    setError(null);
    setEmailStatus(null);
    const email = notificationEmail.trim();
    if (!email) {
      setError("Enter a notification email to continue. You can verify it later from the link we send.");
      return;
    }

    startTransition(async () => {
      const emailResult = await updateNotificationEmailAction(email);
      if (!emailResult.ok) {
        setError(emailResult.message);
        return;
      }
      setEmailStatus(
        "Verification link sent (when email delivery is configured). You can finish setup now and verify later.",
      );

      const prefsResult = await updateNotificationPrefsAction(prefs);
      if (!prefsResult.ok) {
        setError(prefsResult.message);
        return;
      }
      setActiveStep(4);
    });
  }

  function continueFromCalendar() {
    setError(null);
    startTransition(async () => {
      const result = await prepareOnboardingWelcomeAction();
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setWelcomeMessage(result.welcomeMessage ?? null);
      setActiveStep(5);
    });
  }

  function enterApp() {
    startTransition(async () => {
      const result = await completeOnboardingAction();
      if (!result.ok) {
        setError(result.message);
        return;
      }
      try {
        window.sessionStorage.removeItem(ONBOARDING_STEP_STORAGE_KEY);
      } catch {
        // ignore
      }
      await update({ user: { onboardingComplete: true } });
      // Full navigation so layout re-reads onboardingComplete from the session (PC-225).
      window.location.assign("/feed");
    });
  }

  if (welcomeMessage !== null && activeStep === 5) {
    return (
      <Paper elevation={0} sx={{ ...brutalPaperSx, maxWidth: 640, mx: "auto" }}>
        <Typography
          variant="h5"
          component="h1"
          gutterBottom
          sx={{ fontFamily: fontFamilies.display, fontWeight: 700, color: GARDEN_TOKENS.ink }}
        >
          Welcome!
        </Typography>
        <Typography sx={{ mb: 3, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
          {welcomeMessage}
        </Typography>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <Button variant="contained" onClick={enterApp} disabled={pending}>
          {pending ? "Loading…" : "OK"}
        </Button>
      </Paper>
    );
  }

  return (
    <Paper elevation={0} sx={{ ...brutalPaperSx, maxWidth: 640, mx: "auto" }}>
      <Typography
        variant="h5"
        component="h1"
        gutterBottom
        sx={{ fontFamily: fontFamilies.display, fontWeight: 700, color: GARDEN_TOKENS.ink }}
      >
        Welcome to PolyCal
      </Typography>
      <Typography sx={{ mb: 1.5, color: GARDEN_TOKENS.inkMuted }}>
        Complete these steps before using the app.
      </Typography>
      <Typography variant="body2" sx={{ mb: 3, color: GARDEN_TOKENS.inkMuted }}>
        By continuing, you agree to our{" "}
        <MuiLink component={NextLink} href="/terms" underline="hover" target="_blank" rel="noopener noreferrer">
          Terms of Service
        </MuiLink>{" "}
        and acknowledge how PolyCal handles group scheduling data, described in our{" "}
        <MuiLink component={NextLink} href="/privacy" underline="hover" target="_blank" rel="noopener noreferrer">
          Privacy Policy
        </MuiLink>
        .
      </Typography>
      <Stepper
        activeStep={activeStep}
        alternativeLabel
        sx={{
          mb: 3,
          px: 0.5,
          "& .MuiStepLabel-label": {
            fontSize: { xs: "0.65rem", sm: "0.75rem" },
            mt: 0.5,
            lineHeight: 1.2,
            whiteSpace: "normal",
            textAlign: "center",
          },
          "& .MuiStepConnector-root": { top: 10 },
        }}
      >
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
            <ThemeAccentPicker value={theme} onChange={setTheme} />
          </FormControl>
          <FormControl fullWidth>
            <InputLabel id="onboarding-timezone">Time zone</InputLabel>
            <Select
              labelId="onboarding-timezone"
              label="Time zone"
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
            >
              {COMMON_TIMEZONES.map((tz) => (
                <MenuItem key={tz} value={tz}>
                  {tz}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            label="About you (optional)"
            value={profileBio}
            onChange={(event) => setProfileBio(event.target.value)}
            fullWidth
            multiline
            minRows={2}
            inputProps={{ maxLength: PROFILE_BIO_MAX_LENGTH }}
            helperText={`Shown under your name on People & Places. ${profileBio.length}/${PROFILE_BIO_MAX_LENGTH} characters.`}
          />
          <Button variant="contained" onClick={saveAvatarAndTheme} disabled={pending}>
            Continue
          </Button>
        </Stack>
      )}

      {activeStep === 2 && (
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            Select sleeping partners to propose relationships with. Proxy profiles are
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
          <TextField
            label="Notification email"
            type="email"
            value={notificationEmail}
            onChange={(event) => setNotificationEmail(event.target.value)}
            required
            fullWidth
            helperText="We send a verification link. You can finish setup before clicking it — email delivery waits until verified."
            autoComplete="email"
          />
          {emailStatus && (
            <Alert severity="info">{emailStatus}</Alert>
          )}
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
              label="Email (after you verify the address above)"
            />
          </FormGroup>
          <Typography variant="subtitle2">Alert types</Typography>
          <FormGroup>
            {(
              [
                ["sleepingProposals", "Sleeping proposals"],
                ["eventProposals", "Event proposals"],
                ["sleepingPartnerProposals", "Sleeping partner proposals"],
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
          <Button variant="contained" onClick={saveNotifications} disabled={pending}>
            Continue
          </Button>
        </Stack>
      )}

      {activeStep === 4 && (
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            Optional — connect Google Calendar or choose how to receive .ics files for Apple /
            Outlook. You can skip and configure later in Profile.
          </Typography>
          <Suspense fallback={<Typography variant="body2">Loading calendar options…</Typography>}>
            <CalendarIntegrationSettings compact />
          </Suspense>
          <Button variant="contained" onClick={continueFromCalendar} disabled={pending}>
            {pending ? "Loading…" : "Continue"}
          </Button>
          <Button variant="text" onClick={continueFromCalendar} disabled={pending}>
            Skip for now
          </Button>
        </Stack>
      )}
    </Paper>
  );
}
