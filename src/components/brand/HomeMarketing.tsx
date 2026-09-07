"use client";

import { Box, Button, Link as MuiLink, Paper, Stack, Typography } from "@mui/material";
import Image from "next/image";
import NextLink from "next/link";

import { AgeGate } from "@/components/brand/AgeGate";
import {
  BRAND_CORE_DESCRIPTION,
  BRAND_DISPLAY_NAME,
  BRAND_SUPPORT_EMAIL,
  BRAND_SUPPORT_MAILTO,
} from "@/lib/brand/public-identity";
import { brutalPaperSx, brutalPageTitleSx } from "@/theme/brutalUi";
import { fontFamilies } from "@/theme/fonts";
import { GARDEN_TOKENS } from "@/theme/tokens";

/**
 * Public homepage content behind the age gate (PC-494 / carrier brand verification).
 */
export function HomeMarketing({ bypassAgeGate = false }: { bypassAgeGate?: boolean }) {
  return (
    <AgeGate bypass={bypassAgeGate}>
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
        <Paper elevation={0} sx={{ ...brutalPaperSx, width: "100%", maxWidth: 560 }}>
          <Box sx={{ display: "flex", justifyContent: "center", mb: 2 }}>
            <Image
              src="/illustrations/empty-schedule-day.svg"
              alt=""
              width={120}
              height={120}
              priority
            />
          </Box>
          <Typography
            variant="h3"
            component="h1"
            gutterBottom
            sx={{
              ...brutalPageTitleSx,
              fontFamily: fontFamilies.display,
              textAlign: "center",
              fontSize: { xs: "2rem", sm: "2.5rem" },
            }}
          >
            {BRAND_DISPLAY_NAME}
          </Typography>
          <Typography sx={{ mb: 2, color: GARDEN_TOKENS.inkMuted, textAlign: "center" }}>
            {BRAND_CORE_DESCRIPTION}
          </Typography>
          <Typography sx={{ mb: 2, color: GARDEN_TOKENS.inkMuted, textAlign: "center" }}>
            Core services: event and sleeping-arrangement proposals and bookings, partner voting,
            network feed, and optional Google Calendar / iCal sync. Accounts are provisioned by
            your group administrator. You must be 18 or older to use {BRAND_DISPLAY_NAME}.
          </Typography>
          <Typography sx={{ mb: 3, color: GARDEN_TOKENS.inkMuted, textAlign: "center" }}>
            Support:{" "}
            <MuiLink href={BRAND_SUPPORT_MAILTO} underline="hover" color="inherit">
              {BRAND_SUPPORT_EMAIL}
            </MuiLink>
          </Typography>
          <Stack spacing={1.5} alignItems="center">
            <Button component={NextLink} href="/login" variant="contained" size="large">
              Sign in
            </Button>
            <Typography variant="body2" sx={{ color: GARDEN_TOKENS.inkMuted, textAlign: "center" }}>
              <MuiLink component={NextLink} href="/about" underline="hover" color="inherit">
                About
              </MuiLink>
              {" · "}
              <MuiLink component={NextLink} href="/sms-opt-in" underline="hover" color="inherit">
                SMS alerts
              </MuiLink>
              {" · "}
              <MuiLink component={NextLink} href="/privacy" underline="hover" color="inherit">
                Privacy Policy
              </MuiLink>
              {" · "}
              <MuiLink component={NextLink} href="/terms" underline="hover" color="inherit">
                Terms of Service
              </MuiLink>
            </Typography>
          </Stack>
        </Paper>
      </Box>
    </AgeGate>
  );
}
