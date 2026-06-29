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
  MenuItem,
  Paper,
  Radio,
  RadioGroup,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useState, useTransition } from "react";

import {
  changePasswordAction,
  updateDisplayNameAction,
  updateNotificationEmailAction,
  updateNotificationPrefsAction,
  updateProfilePreferencesAction,
  uploadCustomAvatarAction,
} from "@/actions/profile";
import { AVATAR_OPTIONS, avatarSrcForKey, isCustomAvatarKey } from "@/lib/constants/avatars";
import {
  USER_THEME_IDS,
  USER_THEME_LABELS,
  type UserThemeId,
} from "@/lib/constants/themes";
import {
  COMMON_TIMEZONES,
  resolveTimezone,
} from "@/lib/schedule/timezone";
import type { NotificationPrefs } from "@/types/notification-prefs";
import { subscribeToWebPush } from "@/lib/push-client";
import { AvatarCropDialog } from "@/components/profile/AvatarCropDialog";

const ALERT_TYPE_LABELS: Record<keyof NotificationPrefs["alertTypes"], string> = {
  sleepingProposals: "Sleeping proposals",
  eventProposals: "Event proposals",
  sleepingPartnerProposals: "Sleeping partner proposals",
  reminders: "Reminders",
};

export function ProfileSettings({
  initialDisplayName,
  initialAvatarKey,
  initialTheme,
  initialTimezone,
  initialNotificationPrefs,
  initialNotificationEmail,
  initialEmailVerified,
  mustChangePassword,
  vapidPublicKey,
}: {
  initialDisplayName: string;
  initialAvatarKey: string | null;
  initialTheme: string;
  initialTimezone: string;
  initialNotificationPrefs: NotificationPrefs;
  initialNotificationEmail: string | null;
  initialEmailVerified: boolean;
  mustChangePassword: boolean;
  vapidPublicKey: string | null;
}) {
  const router = useRouter();
  const { update } = useSession();
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [avatarKey, setAvatarKey] = useState(initialAvatarKey ?? "bird_blue");
  const [theme, setTheme] = useState<UserThemeId>(
    (USER_THEME_IDS.includes(initialTheme as UserThemeId)
      ? initialTheme
      : "mint") as UserThemeId,
  );
  const [timezone, setTimezone] = useState(resolveTimezone(initialTimezone));
  const [notificationPrefs, setNotificationPrefs] = useState(initialNotificationPrefs);
  const [notificationEmail, setNotificationEmail] = useState(initialNotificationEmail ?? "");
  const [emailVerified, setEmailVerified] = useState(initialEmailVerified);
  const [emailMessage, setEmailMessage] = useState<string | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [prefsMessage, setPrefsMessage] = useState<string | null>(null);
  const [nameMessage, setNameMessage] = useState<string | null>(null);
  const [notifMessage, setNotifMessage] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [prefsError, setPrefsError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [notifError, setNotifError] = useState<string | null>(null);
  const [passwordPending, startPasswordTransition] = useTransition();
  const [prefsPending, startPrefsTransition] = useTransition();
  const [namePending, startNameTransition] = useTransition();
  const [notifPending, startNotifTransition] = useTransition();
  const [avatarUploadPending, startAvatarUploadTransition] = useTransition();
  const [avatarUploadError, setAvatarUploadError] = useState<string | null>(null);
  const [pushMessage, setPushMessage] = useState<string | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);
  const [pushPending, startPushTransition] = useTransition();
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [cropOpen, setCropOpen] = useState(false);

  const customAvatarSrc = isCustomAvatarKey(avatarKey) ? avatarSrcForKey(avatarKey) : undefined;

  function handlePasswordSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordError(null);
    setPasswordMessage(null);
    const formData = new FormData(event.currentTarget);

    startPasswordTransition(async () => {
      const result = await changePasswordAction(formData);
      if (!result.ok) {
        setPasswordError(result.error);
        return;
      }
      setPasswordMessage("Password updated.");
      event.currentTarget.reset();
      if (mustChangePassword) {
        await update({ user: { mustChangePassword: false } });
      }
      router.refresh();
    });
  }

  function handlePreferencesSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPrefsError(null);
    setPrefsMessage(null);
    const formData = new FormData();
    formData.set("avatarKey", avatarKey);
    formData.set("theme", theme);
    formData.set("timezone", timezone);

    startPrefsTransition(async () => {
      const result = await updateProfilePreferencesAction(formData);
      if (!result.ok) {
        setPrefsError(result.error);
        return;
      }
      setPrefsMessage("Preferences saved.");
      await update({ user: { avatarKey, theme } });
      router.refresh();
    });
  }

  function handleDisplayNameSave() {
    setNameError(null);
    setNameMessage(null);
    startNameTransition(async () => {
      const result = await updateDisplayNameAction(displayName);
      if (!result.ok) {
        setNameError(result.error);
        return;
      }
      setNameMessage("Display name updated.");
      await update({ user: { displayName } });
      router.refresh();
    });
  }

  function handleNotificationSave() {
    setNotifError(null);
    setNotifMessage(null);
    startNotifTransition(async () => {
      const result = await updateNotificationPrefsAction(notificationPrefs);
      if (!result.ok) {
        setNotifError(result.error);
        return;
      }
      setNotifMessage("Notification preferences saved.");
    });
  }

  function handleCustomAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setAvatarUploadError(null);
    setCropFile(file);
    setCropOpen(true);
    event.target.value = "";
  }

  function uploadCroppedAvatar(file: File) {
    const formData = new FormData();
    formData.set("avatar", file);
    startAvatarUploadTransition(async () => {
      const result = await uploadCustomAvatarAction(formData);
      if (!result.ok) {
        setAvatarUploadError(result.error);
        return;
      }
      setAvatarKey(result.avatarKey);
      await update({ user: { avatarKey: result.avatarKey } });
      router.refresh();
    });
  }

  function handleNotificationEmailSave() {
    setEmailMessage(null);
    setNotifError(null);
    startNotifTransition(async () => {
      const result = await updateNotificationEmailAction(notificationEmail);
      if (!result.ok) {
        setNotifError(result.error);
        return;
      }
      setEmailVerified(false);
      setEmailMessage(
        result.verificationUrl
          ? `Verification link generated (dev): ${result.verificationUrl}`
          : "Verification email queued.",
      );
    });
  }

  function handleEnablePushNotifications() {
    setPushError(null);
    setPushMessage(null);
    if (!vapidPublicKey) {
      setPushError("Push notifications are not configured on this server.");
      return;
    }

    startPushTransition(async () => {
      const subscribed = await subscribeToWebPush(vapidPublicKey);
      if (!subscribed) {
        setPushError("Browser permission denied or push is unavailable on this device.");
        return;
      }

      const updatedPrefs: NotificationPrefs = {
        ...notificationPrefs,
        channels: { ...notificationPrefs.channels, push: true },
      };
      const result = await updateNotificationPrefsAction(updatedPrefs);
      if (!result.ok) {
        setPushError(result.error);
        return;
      }

      setNotificationPrefs(updatedPrefs);
      setPushMessage("Push notifications enabled for this device.");
    });
  }

  function handleDisablePushNotifications() {
    setPushError(null);
    setPushMessage(null);
    const updatedPrefs: NotificationPrefs = {
      ...notificationPrefs,
      channels: { ...notificationPrefs.channels, push: false },
    };
    setNotificationPrefs(updatedPrefs);
    startNotifTransition(async () => {
      const result = await updateNotificationPrefsAction(updatedPrefs);
      if (!result.ok) {
        setPushError(result.error);
        return;
      }
      setPushMessage("Push notifications disabled.");
    });
  }

  return (
    <Stack spacing={3}>
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Display name
        </Typography>
        {nameError && <Alert severity="error" sx={{ mb: 2 }}>{nameError}</Alert>}
        {nameMessage && <Alert severity="success" sx={{ mb: 2 }}>{nameMessage}</Alert>}
        <Stack direction="row" spacing={2} alignItems="flex-start">
          <TextField
            label="Display name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            fullWidth
          />
          <Button variant="contained" onClick={handleDisplayNameSave} disabled={namePending}>
            Save
          </Button>
        </Stack>
      </Paper>

      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Password
        </Typography>
        {mustChangePassword && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            Password change required on first login.
          </Alert>
        )}
        {passwordError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {passwordError}
          </Alert>
        )}
        {passwordMessage && (
          <Alert severity="success" sx={{ mb: 2 }}>
            {passwordMessage}
          </Alert>
        )}
        <Box component="form" onSubmit={handlePasswordSubmit}>
          <Stack spacing={2}>
            <TextField
              name="currentPassword"
              label="Current password"
              type="password"
              required
              fullWidth
              autoComplete="current-password"
            />
            <TextField
              name="newPassword"
              label="New password"
              type="password"
              required
              fullWidth
              autoComplete="new-password"
            />
            <TextField
              name="confirmPassword"
              label="Confirm new password"
              type="password"
              required
              fullWidth
              autoComplete="new-password"
            />
            <Button type="submit" variant="contained" disabled={passwordPending}>
              {passwordPending ? "Saving…" : "Update password"}
            </Button>
          </Stack>
        </Box>
      </Paper>

      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Avatar & accent theme
        </Typography>
        {prefsError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {prefsError}
          </Alert>
        )}
        {prefsMessage && (
          <Alert severity="success" sx={{ mb: 2 }}>
            {prefsMessage}
          </Alert>
        )}
        <Box component="form" onSubmit={handlePreferencesSubmit}>
          <FormControl component="fieldset" sx={{ mb: 3 }}>
            <FormLabel component="legend">Avatar</FormLabel>
            <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mt: 1 }}>
              {AVATAR_OPTIONS.map((option) => (
                <Button
                  key={option.key}
                  type="button"
                  variant={avatarKey === option.key ? "contained" : "outlined"}
                  onClick={() => setAvatarKey(option.key)}
                  aria-pressed={avatarKey === option.key}
                  sx={{ minWidth: 72, p: 1 }}
                >
                  <Avatar
                    src={option.src}
                    alt={option.label}
                    sx={{ width: 40, height: 40 }}
                  />
                </Button>
              ))}
            </Stack>
          </FormControl>

          <Stack spacing={1} sx={{ mb: 2 }}>
            <FormLabel component="legend">Custom avatar</FormLabel>
            {avatarUploadError && (
              <Alert severity="error">{avatarUploadError}</Alert>
            )}
            <Stack direction="row" spacing={2} alignItems="center">
              {customAvatarSrc && (
                <Avatar src={customAvatarSrc} alt="Your custom avatar" sx={{ width: 48, height: 48 }} />
              )}
              <Button variant="outlined" component="label" disabled={avatarUploadPending}>
                {avatarUploadPending ? "Uploading…" : "Upload image"}
                <input
                  type="file"
                  hidden
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={handleCustomAvatarChange}
                />
              </Button>
              {isCustomAvatarKey(avatarKey) && (
                <Typography variant="caption" color="text.secondary">
                  Custom avatar selected
                </Typography>
              )}
            </Stack>
          </Stack>

          <FormControl component="fieldset" sx={{ mb: 2 }}>
            <FormLabel component="legend">Accent theme</FormLabel>
            <RadioGroup
              value={theme}
              onChange={(event) => setTheme(event.target.value as UserThemeId)}
            >
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

          <FormControl fullWidth sx={{ mb: 2 }}>
            <FormLabel component="legend" sx={{ mb: 1 }}>
              Time zone
            </FormLabel>
            <Select
              value={timezone}
              onChange={(event) => setTimezone(resolveTimezone(event.target.value))}
              size="small"
              aria-label="Time zone"
            >
              {COMMON_TIMEZONES.map((tz) => (
                <MenuItem key={tz} value={tz}>
                  {tz.replaceAll("_", " ")}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Button type="submit" variant="contained" disabled={prefsPending}>
            {prefsPending ? "Saving…" : "Save preferences"}
          </Button>
        </Box>
      </Paper>

      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Notifications
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          In-app inbox alerts and optional browser push are configured separately. Email delivery
          queues when your address is verified.
        </Typography>
        <Stack direction="row" spacing={2} alignItems="flex-start" sx={{ mb: 2 }}>
          <TextField
            label="Notification email"
            type="email"
            value={notificationEmail}
            onChange={(e) => setNotificationEmail(e.target.value)}
            fullWidth
            helperText={
              emailVerified
                ? "Verified"
                : notificationEmail
                  ? "Pending verification"
                  : "Optional"
            }
          />
          <Button variant="outlined" onClick={handleNotificationEmailSave} disabled={notifPending}>
            Save email
          </Button>
        </Stack>
        {emailMessage && <Alert severity="info" sx={{ mb: 2 }}>{emailMessage}</Alert>}
        {notifError && <Alert severity="error" sx={{ mb: 2 }}>{notifError}</Alert>}
        {notifMessage && <Alert severity="success" sx={{ mb: 2 }}>{notifMessage}</Alert>}
        <FormControlLabel
          control={
            <Checkbox
              checked={notificationPrefs.globalEnabled}
              onChange={(e) =>
                setNotificationPrefs({ ...notificationPrefs, globalEnabled: e.target.checked })
              }
            />
          }
          label="Enable notifications"
        />
        <FormGroup sx={{ mb: 2 }}>
          <FormControlLabel
            control={
              <Checkbox
                checked={notificationPrefs.channels.inApp}
                onChange={(e) =>
                  setNotificationPrefs({
                    ...notificationPrefs,
                    channels: { ...notificationPrefs.channels, inApp: e.target.checked },
                  })
                }
              />
            }
            label="In-app inbox"
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={notificationPrefs.channels.email}
                onChange={(e) =>
                  setNotificationPrefs({
                    ...notificationPrefs,
                    channels: { ...notificationPrefs.channels, email: e.target.checked },
                  })
                }
              />
            }
            label="Email"
          />
        </FormGroup>
        <Typography variant="subtitle2">Browser push</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Push requires explicit opt-in. Enable below to receive alerts on this device even when
          PolyCal is closed.
        </Typography>
        {pushError && <Alert severity="error" sx={{ mb: 1 }}>{pushError}</Alert>}
        {pushMessage && <Alert severity="success" sx={{ mb: 1 }}>{pushMessage}</Alert>}
        <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
          <Button
            variant="contained"
            onClick={handleEnablePushNotifications}
            disabled={pushPending || !vapidPublicKey || notificationPrefs.channels.push}
          >
            {pushPending ? "Enabling…" : "Enable push notifications"}
          </Button>
          {notificationPrefs.channels.push && (
            <Button
              variant="outlined"
              color="inherit"
              onClick={handleDisablePushNotifications}
              disabled={notifPending}
            >
              Disable push
            </Button>
          )}
        </Stack>
        <Typography variant="subtitle2" sx={{ mt: 1 }}>
          Quiet hours
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          In-app and push alerts are paused during this window (email still delivers).
        </Typography>
        <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
          <TextField
            label="Start"
            type="time"
            value={notificationPrefs.quietHoursStart ?? ""}
            onChange={(e) =>
              setNotificationPrefs({
                ...notificationPrefs,
                quietHoursStart: e.target.value || null,
              })
            }
            InputLabelProps={{ shrink: true }}
            fullWidth
          />
          <TextField
            label="End"
            type="time"
            value={notificationPrefs.quietHoursEnd ?? ""}
            onChange={(e) =>
              setNotificationPrefs({
                ...notificationPrefs,
                quietHoursEnd: e.target.value || null,
              })
            }
            InputLabelProps={{ shrink: true }}
            fullWidth
          />
        </Stack>
        <Typography variant="subtitle2">Alert types</Typography>
        <FormGroup sx={{ mb: 2 }}>
          {(Object.keys(ALERT_TYPE_LABELS) as Array<keyof NotificationPrefs["alertTypes"]>).map(
            (key) => (
              <FormControlLabel
                key={key}
                control={
                  <Checkbox
                    checked={notificationPrefs.alertTypes[key]}
                    onChange={(e) =>
                      setNotificationPrefs({
                        ...notificationPrefs,
                        alertTypes: {
                          ...notificationPrefs.alertTypes,
                          [key]: e.target.checked,
                        },
                      })
                    }
                  />
                }
                label={ALERT_TYPE_LABELS[key]}
              />
            ),
          )}
        </FormGroup>
        <Button variant="contained" onClick={handleNotificationSave} disabled={notifPending}>
          {notifPending ? "Saving…" : "Save notification preferences"}
        </Button>
      </Paper>

      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Session
        </Typography>
        <Button
          variant="outlined"
          color="inherit"
          onClick={() => void signOut({ callbackUrl: "/login" })}
        >
          Log out
        </Button>
      </Paper>

      <AvatarCropDialog
        open={cropOpen}
        file={cropFile}
        onClose={() => {
          setCropOpen(false);
          setCropFile(null);
        }}
        onConfirm={(croppedFile) => {
          setCropOpen(false);
          setCropFile(null);
          uploadCroppedAvatar(croppedFile);
        }}
      />
    </Stack>
  );
}
