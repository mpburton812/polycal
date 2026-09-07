import { Box, Link as MuiLink, Paper, Typography } from "@mui/material";
import type { Metadata } from "next";
import NextLink from "next/link";

import { AgeGate } from "@/components/brand/AgeGate";
import {
  BRAND_CORE_DESCRIPTION,
  BRAND_DISPLAY_NAME,
  BRAND_SUPPORT_EMAIL,
  BRAND_SUPPORT_MAILTO,
} from "@/lib/brand/public-identity";
import { brutalPaperSx, brutalPageTitleSx } from "@/theme/brutalUi";
import { GARDEN_TOKENS } from "@/theme/tokens";

export const metadata: Metadata = {
  title: `About · ${BRAND_DISPLAY_NAME}`,
  description: BRAND_CORE_DESCRIPTION,
};

/**
 * Public About page for carrier brand verification (PC-494).
 */
export default function AboutPage() {
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
        <Paper elevation={0} sx={{ ...brutalPaperSx, width: "100%", maxWidth: 640, my: 4 }}>
          <Typography variant="h4" component="h1" sx={{ ...brutalPageTitleSx, mb: 2 }}>
            About {BRAND_DISPLAY_NAME}
          </Typography>
          <Typography paragraph sx={{ color: GARDEN_TOKENS.ink }}>
            {BRAND_CORE_DESCRIPTION}
          </Typography>
          <Typography paragraph sx={{ color: GARDEN_TOKENS.ink }}>
            Our core activities are coordinating shared calendars for intimate networks: creating
            proposals and bookings, collecting partner votes, posting network updates, and
            optionally syncing confirmed events to external calendars.
          </Typography>
          <Typography paragraph sx={{ color: GARDEN_TOKENS.ink }}>
            {BRAND_DISPLAY_NAME} is for adults 18 years and older.
          </Typography>
          <Typography paragraph sx={{ color: GARDEN_TOKENS.ink }}>
            Public support email:{" "}
            <MuiLink href={BRAND_SUPPORT_MAILTO} underline="hover">
              {BRAND_SUPPORT_EMAIL}
            </MuiLink>
          </Typography>
          <Typography variant="body2" sx={{ mt: 3, color: GARDEN_TOKENS.inkMuted }}>
            <MuiLink component={NextLink} href="/" underline="hover" color="inherit">
              Home
            </MuiLink>
            {" · "}
            <MuiLink component={NextLink} href="/sms-opt-in" underline="hover" color="inherit">
              SMS alerts
            </MuiLink>
            {" · "}
            <MuiLink component={NextLink} href="/privacy" underline="hover" color="inherit">
              Privacy
            </MuiLink>
            {" · "}
            <MuiLink component={NextLink} href="/terms" underline="hover" color="inherit">
              Terms
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
