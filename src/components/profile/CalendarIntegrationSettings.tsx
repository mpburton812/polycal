"use client";

/**
 * Profile / onboarding calendar integration controls (PC-341).
 */
import {
  Alert,
  Box,
  Button,
  FormControl,
  FormControlLabel,
  FormLabel,
  Link as MuiLink,
  MenuItem,
  Radio,
  RadioGroup,
  Select,
  Stack,
  Typography,
} from "@mui/material";
import NextLink from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import {
  disconnectCalendarAction,
  getCalendarConnectionAction,
  listGoogleCalendarsAction,
  listPendingIcsDownloadsAction,
  dismissPendingIcsAction,
  saveIcsCalendarPrefsAction,
  setGoogleCalendarIdAction,
  type CalendarConnectionView,
  type PendingIcsView,
} from "@/actions/calendar";
import type { IcsDeliveryMode } from "@/lib/calendar/types";
import { brutalPaperSx, brutalSectionTitleSx } from "@/theme/brutalUi";
import { Paper } from "@mui/material";

export function CalendarIntegrationSettings({
  compact = false,
}: {
  /** When true, omit outer Paper (for onboarding embedding). */
  compact?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [connection, setConnection] = useState<CalendarConnectionView | null>(null);
  const [pending, setPending] = useState<PendingIcsView[]>([]);
  const [calendars, setCalendars] = useState<{ id: string; summary: string; primary?: boolean }[]>(
    [],
  );
  const [providerChoice, setProviderChoice] = useState<"google" | "ics" | "">("");
  const [icsDelivery, setIcsDelivery] = useState<IcsDeliveryMode>("download");
  const [selectedCalendarId, setSelectedCalendarId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingUi, startTransition] = useTransition();

  async function refresh() {
    const [conn, pendingRows] = await Promise.all([
      getCalendarConnectionAction(),
      listPendingIcsDownloadsAction(),
    ]);
    setConnection(conn);
    setPending(pendingRows);
    if (conn?.provider === "google" && conn.googleCalendarId) {
      setProviderChoice("google");
      setSelectedCalendarId(conn.googleCalendarId);
    } else if (conn?.provider === "google") {
      setProviderChoice("google");
    } else if (conn?.icsDelivery) {
      setProviderChoice("ics");
      setIcsDelivery(conn.icsDelivery);
    }
  }

  useEffect(() => {
    void refresh();
    const err = searchParams.get("calendarError");
    if (err) setError(err);
    if (searchParams.get("calendarGoogle") === "1") {
      setMessage("Google connected — pick which calendar to write into.");
      setProviderChoice("google");
      startTransition(() => {
        void listGoogleCalendarsAction().then(async (result) => {
          if (result.ok) {
            setCalendars(result.calendars);
            const primary = result.calendars.find((c) => c.primary) ?? result.calendars[0];
            if (primary) {
              setSelectedCalendarId(primary.id);
              // Auto-save primary when OAuth just connected but no calendar chosen yet (PC-347).
              const conn = await getCalendarConnectionAction();
              if (conn?.provider === "google" && !conn.googleCalendarId) {
                const saved = await setGoogleCalendarIdAction(primary.id);
                if (saved.ok) {
                  setMessage(
                    `Google connected — using ${primary.summary}${primary.primary ? " (primary)" : ""}. You can change it below.`,
                  );
                  await refresh();
                  router.refresh();
                }
              }
            }
          } else {
            setError(result.message);
          }
        });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount / query
  }, []);

  const body = (
    <Stack spacing={2}>
      {!compact && (
        <Typography variant="h6" component="h2" sx={brutalSectionTitleSx}>
          Calendar integration
        </Typography>
      )}
      <Typography variant="body2" color="text.secondary">
        Sync confirmed events to Google Calendar, or get .ics files for Apple Calendar / Outlook
        (iCal / Other). PolyCal never creates a new shared calendar — it writes into a calendar you
        already have, or gives you a file to add yourself.
      </Typography>

      {connection?.impersonating && (
        <Alert severity="info">
          Google Calendar connect, list, sync, and disconnect are disabled while impersonating.
          Sign back in as yourself to manage calendar integration.
        </Alert>
      )}

      {providerChoice === "google" && !connection?.impersonating && (
        <Typography variant="body2" color="text.secondary">
          Connecting Google lets PolyCal create and update events on a calendar you choose. Tokens
          are encrypted at rest; admins cannot access your Google Calendar data. See how we handle
          Google user data in our{" "}
          <MuiLink component={NextLink} href="/privacy#google" underline="hover">
            Privacy Policy
          </MuiLink>
          .
        </Typography>
      )}

      {error && (
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {message && (
        <Alert severity="success" onClose={() => setMessage(null)}>
          {message}
        </Alert>
      )}

      {connection?.status === "needs_reconnect" && (
        <Alert severity="warning">Google connection expired. Reconnect below.</Alert>
      )}

      {pending.length > 0 && (
        <Stack spacing={1}>
          <Typography variant="subtitle2">Pending calendar downloads</Typography>
          {pending.map((row) => (
            <Stack
              key={row.id}
              direction={{ xs: "column", sm: "row" }}
              spacing={1}
              alignItems={{ sm: "center" }}
            >
              <Typography variant="body2" sx={{ flex: 1 }}>
                {row.title} ({row.method})
              </Typography>
              <Button
                size="small"
                variant="contained"
                href={`/api/calendar/ics/${row.id}`}
                onClick={() => {
                  setTimeout(() => void refresh(), 500);
                }}
              >
                Download .ics
              </Button>
              <Button
                size="small"
                disabled={pendingUi}
                onClick={() => {
                  startTransition(async () => {
                    await dismissPendingIcsAction(row.id);
                    await refresh();
                  });
                }}
              >
                Dismiss
              </Button>
            </Stack>
          ))}
        </Stack>
      )}

      <FormControl>
        <FormLabel id="calendar-provider-label">Provider</FormLabel>
        <RadioGroup
          aria-labelledby="calendar-provider-label"
          value={providerChoice}
          onChange={(e) => setProviderChoice(e.target.value as "google" | "ics")}
        >
          <FormControlLabel
            value="google"
            control={<Radio />}
            disabled={!connection?.googleConfigured || Boolean(connection?.impersonating)}
            label={
              connection?.impersonating
                ? "Google Calendar (disabled while impersonating)"
                : connection?.googleConfigured
                  ? "Google Calendar (automatic sync)"
                  : "Google Calendar (not configured on server)"
            }
          />
          <FormControlLabel
            value="ics"
            control={<Radio />}
            disabled={Boolean(connection?.impersonating)}
            label="iCal / Other (.ics file)"
          />
        </RadioGroup>
      </FormControl>

      {providerChoice === "google" && (
        <Stack spacing={1.5}>
          {connection?.provider === "google" && connection.googleAccountEmail && (
            <Typography variant="body2">
              Connected as {connection.googleAccountEmail}
              {connection.googleCalendarId ? ` → calendar selected` : ""}
            </Typography>
          )}
          <Button
            variant="outlined"
            href={
              compact
                ? "/api/calendar/google/start?return=onboarding"
                : "/api/calendar/google/start"
            }
            disabled={!connection?.googleConfigured || Boolean(connection?.impersonating)}
          >
            {connection?.provider === "google" ? "Reconnect Google" : "Connect Google Calendar"}
          </Button>
          {(calendars.length > 0 || connection?.googleCalendarId) && (
            <>
              {calendars.length > 0 && (
                <FormControl fullWidth size="small">
                  <Select
                    value={selectedCalendarId}
                    displayEmpty
                    onChange={(e) => setSelectedCalendarId(e.target.value)}
                    inputProps={{ "aria-label": "Google calendar" }}
                  >
                    <MenuItem value="" disabled>
                      Choose calendar
                    </MenuItem>
                    {calendars.map((cal) => (
                      <MenuItem key={cal.id} value={cal.id}>
                        {cal.summary}
                        {cal.primary ? " (primary)" : ""}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
              <Button
                variant="contained"
                disabled={pendingUi || !selectedCalendarId || Boolean(connection?.impersonating)}
                onClick={() => {
                  startTransition(async () => {
                    const result = await setGoogleCalendarIdAction(selectedCalendarId);
                    if (!result.ok) setError(result.message);
                    else {
                      setMessage(result.message);
                      await refresh();
                      router.refresh();
                    }
                  });
                }}
              >
                Save Google calendar
              </Button>
              {calendars.length === 0 && connection?.provider === "google" && (
                <Button
                  size="small"
                  disabled={pendingUi || Boolean(connection?.impersonating)}
                  onClick={() => {
                    startTransition(async () => {
                      const result = await listGoogleCalendarsAction();
                      if (result.ok) setCalendars(result.calendars);
                      else setError(result.message);
                    });
                  }}
                >
                  Load calendars
                </Button>
              )}
            </>
          )}
        </Stack>
      )}

      {providerChoice === "ics" && (
        <Stack spacing={1.5}>
          <FormControl>
            <FormLabel id="ics-delivery-label">Delivery</FormLabel>
            <RadioGroup
              aria-labelledby="ics-delivery-label"
              value={icsDelivery}
              onChange={(e) => setIcsDelivery(e.target.value as IcsDeliveryMode)}
            >
              <FormControlLabel value="download" control={<Radio />} label="Download only" />
              <FormControlLabel
                value="email"
                control={<Radio />}
                label="Email .ics (verified notification email)"
              />
              <FormControlLabel
                value="both"
                control={<Radio />}
                label="Both email and download"
              />
            </RadioGroup>
          </FormControl>
          <Typography variant="caption" color="text.secondary">
            If email is unavailable, PolyCal notifies you and offers the file when you next open the
            app. “Both” keeps a pending download even after email succeeds.
          </Typography>
          <Button
            variant="contained"
            disabled={pendingUi || Boolean(connection?.impersonating)}
            onClick={() => {
              startTransition(async () => {
                const result = await saveIcsCalendarPrefsAction(icsDelivery);
                if (!result.ok) setError(result.message);
                else {
                  setMessage(result.message);
                  await refresh();
                  router.refresh();
                }
              });
            }}
          >
            Save iCal / Other preferences
          </Button>
        </Stack>
      )}

      {(connection?.configured &&
        ((connection.provider === "google" && connection.googleCalendarId) ||
          connection.icsDelivery)) ? (
        <Button
          color="warning"
          disabled={pendingUi || Boolean(connection?.impersonating)}
          onClick={() => {
            startTransition(async () => {
              await disconnectCalendarAction();
              setProviderChoice("");
              setMessage("Calendar integration disconnected.");
              await refresh();
              router.refresh();
            });
          }}
        >
          Disconnect calendar integration
        </Button>
      ) : null}
    </Stack>
  );

  if (compact) {
    return <Box id="calendar-integration">{body}</Box>;
  }
  return (
    <Paper id="calendar-integration" sx={{ ...brutalPaperSx, p: 2, mb: 2 }}>
      {body}
    </Paper>
  );
}
