"use client";

import {
  Alert,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  Link as MuiLink,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import NextLink from "next/link";
import { useState, useTransition } from "react";

import { AgeGate } from "@/components/brand/AgeGate";
import { submitPublicSmsOptInAction } from "@/actions/sms-opt-in";
import { isAdultBirthdate } from "@/lib/brand/age-gate";
import {
  BRAND_DISPLAY_NAME,
  BRAND_SUPPORT_EMAIL,
  BRAND_SUPPORT_MAILTO,
  brandSmsDisclaimerText,
} from "@/lib/brand/public-identity";
import { brutalPaperSx, brutalPageTitleSx } from "@/theme/brutalUi";
import { GARDEN_TOKENS } from "@/theme/tokens";

/**
 * Public Telnyx-style SMS opt-in form (PC-494). Age-gated; consent unchecked by default.
 */
export function PublicSmsOptInForm() {
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [month, setMonth] = useState("");
  const [day, setDay] = useState("");
  const [year, setYear] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    const y = Number(year);
    const m = Number(month);
    const d = Number(day);
    if (!isAdultBirthdate(y, m, d)) {
      setError("Enter a valid birthdate confirming you are 18 or older.");
      return;
    }
    if (!phone.trim()) {
      setError("Enter a mobile phone number to opt in to SMS.");
      return;
    }
    if (!consent) {
      setError("Check the SMS consent box to opt in (optional — you may leave without opting in).");
      return;
    }
    startTransition(async () => {
      const result = await submitPublicSmsOptInAction({
        phone: phone.trim(),
        consent: true,
        birthYear: y,
        birthMonth: m,
        birthDay: d,
        sourcePath: "/sms-opt-in",
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setMessage(result.message);
      setConsent(false);
      setPhone("");
    });
  }

  return (
    <AgeGate>
      <Box
        sx={{
          minHeight: "100vh",
          display: "flex",
          justifyContent: "center",
          bgcolor: GARDEN_TOKENS.background,
          p: 2,
        }}
      >
        <Paper elevation={0} sx={{ ...brutalPaperSx, width: "100%", maxWidth: 560, my: 4 }}>
          <Typography variant="h4" component="h1" sx={{ ...brutalPageTitleSx, mb: 1 }}>
            SMS alerts opt-in
          </Typography>
          <Typography variant="body2" sx={{ mb: 2, color: GARDEN_TOKENS.inkMuted }}>
            Optional SMS from {BRAND_DISPLAY_NAME} for account and calendar reminders. You can use
            the product without SMS. Support:{" "}
            <MuiLink href={BRAND_SUPPORT_MAILTO}>{BRAND_SUPPORT_EMAIL}</MuiLink>
          </Typography>

          <Box component="form" onSubmit={onSubmit}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Confirm you are 18+
            </Typography>
            <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
              <TextField
                label="Month"
                value={month}
                onChange={(e) => setMonth(e.target.value.replace(/\D/g, "").slice(0, 2))}
                size="small"
                fullWidth
                required
              />
              <TextField
                label="Day"
                value={day}
                onChange={(e) => setDay(e.target.value.replace(/\D/g, "").slice(0, 2))}
                size="small"
                fullWidth
                required
              />
              <TextField
                label="Year"
                value={year}
                onChange={(e) => setYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
                size="small"
                fullWidth
                required
              />
            </Stack>

            <TextField
              label="Mobile phone number"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              fullWidth
              size="small"
              sx={{ mb: 2 }}
              placeholder="+1 555 555 0100"
              inputProps={{ "aria-label": "Mobile phone number", autoComplete: "tel" }}
            />

            <FormControlLabel
              control={
                <Checkbox
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  color="primary"
                />
              }
              label={`I agree to receive SMS account alerts and calendar reminders from ${BRAND_DISPLAY_NAME}.`}
              sx={{ alignItems: "flex-start", mb: 1 }}
            />
            <Typography variant="caption" display="block" sx={{ mb: 2, color: GARDEN_TOKENS.inkMuted }}>
              {brandSmsDisclaimerText()}{" "}
              <MuiLink component={NextLink} href="/privacy" underline="hover">
                Privacy Policy
              </MuiLink>
              {" · "}
              <MuiLink component={NextLink} href="/terms" underline="hover">
                Terms of Service
              </MuiLink>
            </Typography>

            {error ? (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            ) : null}
            {message ? (
              <Alert severity="success" sx={{ mb: 2 }}>
                {message}
              </Alert>
            ) : null}

            <Button type="submit" variant="contained" disabled={pending} fullWidth>
              {pending ? "Saving…" : "Submit SMS opt-in"}
            </Button>
          </Box>

          <Typography variant="body2" sx={{ mt: 3, color: GARDEN_TOKENS.inkMuted }}>
            <MuiLink component={NextLink} href="/" underline="hover" color="inherit">
              Home
            </MuiLink>
            {" · "}
            <MuiLink component={NextLink} href="/about" underline="hover" color="inherit">
              About
            </MuiLink>
            {" · "}
            <MuiLink component={NextLink} href="/login" underline="hover" color="inherit">
              Sign in
            </MuiLink>
          </Typography>
        </Paper>
      </Box>
    </AgeGate>
  );
}
