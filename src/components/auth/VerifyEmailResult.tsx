import { Alert, Box, Button, Paper, Typography } from "@mui/material";
import Link from "next/link";

import { brutalPaperSx } from "@/theme/brutalUi";
import { fontFamilies } from "@/theme/fonts";
import { GARDEN_TOKENS } from "@/theme/tokens";
import type { VerifyNotificationEmailOutcome } from "@/lib/email/verify-notification-email";

/**
 * Garden-branded card for notification-email verification outcomes (PC-207).
 */
export function VerifyEmailResult({
  outcome,
}: {
  outcome: VerifyNotificationEmailOutcome;
}) {
  const isSuccess = outcome === "ok";

  let title = "Email verified";
  let body =
    "Your notification email is confirmed. PolyCal can send schedule alerts to this address.";
  let severity: "success" | "warning" | "error" | "info" = "success";

  if (outcome === "missing") {
    title = "Verification link missing";
    body =
      "Open the link from your email, or save your notification email again under Profile to get a new link.";
    severity = "warning";
  } else if (outcome === "invalid_or_expired") {
    title = "Link invalid or expired";
    body =
      "This verification link is no longer valid. Sign in, open Profile, and save your notification email to request a new one.";
    severity = "error";
  } else if (outcome === "rate_limited") {
    title = "Too many attempts";
    body = "Please wait a minute and try the link from your email again.";
    severity = "warning";
  }

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: GARDEN_TOKENS.background,
        backgroundImage: `radial-gradient(ellipse at 20% 0%, ${GARDEN_TOKENS.sage}22 0%, transparent 55%),
          radial-gradient(ellipse at 80% 100%, ${GARDEN_TOKENS.mustard}18 0%, transparent 50%)`,
        p: 2,
      }}
    >
      <Paper elevation={0} sx={{ ...brutalPaperSx, width: "100%", maxWidth: 420 }}>
        <Typography
          component="p"
          sx={{
            fontFamily: fontFamilies.display,
            fontWeight: 700,
            fontSize: "1.5rem",
            color: GARDEN_TOKENS.ink,
            mb: 0.5,
          }}
        >
          PolyCal
        </Typography>
        <Typography
          variant="h5"
          component="h1"
          sx={{ fontFamily: fontFamilies.display, fontWeight: 700, mb: 2 }}
        >
          {title}
        </Typography>
        <Alert severity={severity} sx={{ mb: 2 }}>
          {body}
        </Alert>
        {isSuccess ? (
          <Button component={Link} href="/schedule" variant="contained" fullWidth>
            Continue to PolyCal
          </Button>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <Button component={Link} href="/login" variant="contained" fullWidth>
              Sign in
            </Button>
            <Button component={Link} href="/login?callbackUrl=/profile" variant="outlined" fullWidth>
              Go to Profile
            </Button>
          </Box>
        )}
      </Paper>
    </Box>
  );
}
