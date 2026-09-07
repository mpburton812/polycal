"use client";

import { Box, Button, Stack, TextField, Typography } from "@mui/material";
import { useEffect, useState } from "react";

import {
  AGE_GATE_COOKIE,
  AGE_GATE_COOKIE_MAX_AGE_SEC,
  isAdultBirthdate,
} from "@/lib/brand/age-gate";
import { BRAND_DISPLAY_NAME } from "@/lib/brand/public-identity";
import { brutalPaperSx } from "@/theme/brutalUi";
import { GARDEN_TOKENS } from "@/theme/tokens";

function readAgeCookie(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie.split(";").some((part) => part.trim().startsWith(`${AGE_GATE_COOKIE}=1`));
}

function writeAgeCookie(): void {
  document.cookie = `${AGE_GATE_COOKIE}=1; path=/; max-age=${AGE_GATE_COOKIE_MAX_AGE_SEC}; SameSite=Lax`;
}

/**
 * Birthdate age gate for public marketing / SMS pages (PC-494).
 * Stores only a verification cookie — never the birthdate.
 */
export function AgeGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [month, setMonth] = useState("");
  const [day, setDay] = useState("");
  const [year, setYear] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    const ok = readAgeCookie();
    setAllowed(ok);
    setReady(true);
  }, []);

  function submit() {
    setError(null);
    const y = Number(year);
    const m = Number(month);
    const d = Number(day);
    if (Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d) || !month || !day || !year) {
      setError("Enter a valid birthdate (month, day, year).");
      return;
    }
    if (!isAdultBirthdate(y, m, d)) {
      setDenied(true);
      setError(`${BRAND_DISPLAY_NAME} is for adults 18 and older.`);
      return;
    }
    writeAgeCookie();
    setAllowed(true);
    setDenied(false);
  }

  if (!ready) {
    return (
      <Box sx={{ minHeight: "100vh", bgcolor: GARDEN_TOKENS.background }} aria-busy="true" />
    );
  }

  if (allowed) {
    return <>{children}</>;
  }

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: GARDEN_TOKENS.background,
        p: 2,
      }}
    >
      <Box sx={{ ...brutalPaperSx, width: "100%", maxWidth: 420 }}>
        <Typography variant="h5" component="h1" gutterBottom sx={{ fontWeight: 700 }}>
          Age verification
        </Typography>
        <Typography variant="body2" sx={{ mb: 2, color: GARDEN_TOKENS.inkMuted }}>
          {BRAND_DISPLAY_NAME} is intended for people 18 years and older. Enter your birthdate to
          continue. We do not store your birthdate — only that you verified your age.
        </Typography>
        <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
          <TextField
            label="Month"
            value={month}
            onChange={(e) => setMonth(e.target.value.replace(/\D/g, "").slice(0, 2))}
            inputProps={{ inputMode: "numeric", "aria-label": "Birth month" }}
            size="small"
            fullWidth
          />
          <TextField
            label="Day"
            value={day}
            onChange={(e) => setDay(e.target.value.replace(/\D/g, "").slice(0, 2))}
            inputProps={{ inputMode: "numeric", "aria-label": "Birth day" }}
            size="small"
            fullWidth
          />
          <TextField
            label="Year"
            value={year}
            onChange={(e) => setYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
            inputProps={{ inputMode: "numeric", "aria-label": "Birth year" }}
            size="small"
            fullWidth
          />
        </Stack>
        {error ? (
          <Typography color="error" variant="body2" sx={{ mb: 1 }}>
            {error}
          </Typography>
        ) : null}
        {!denied ? (
          <Button variant="contained" fullWidth onClick={submit}>
            I am 18 or older — Continue
          </Button>
        ) : (
          <Typography variant="body2" sx={{ color: GARDEN_TOKENS.inkMuted }}>
            You cannot use this site if you are under 18.
          </Typography>
        )}
      </Box>
    </Box>
  );
}
