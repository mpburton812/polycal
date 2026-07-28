import { Box, Button, Link as MuiLink, Paper, Stack, Typography } from "@mui/material";
import type { Metadata } from "next";
import Image from "next/image";
import NextLink from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { brutalPaperSx, brutalPageTitleSx } from "@/theme/brutalUi";
import { fontFamilies } from "@/theme/fonts";
import { GARDEN_TOKENS } from "@/theme/tokens";

export const metadata: Metadata = {
  title: "PolyCal",
  description:
    "PolyCal is a private-group scheduling app for polyamorous households — proposals, sleeping arrangements, feed, and optional Google Calendar sync.",
};

/**
 * Public homepage for OAuth brand verification and first-time visitors (PC-344).
 * Signed-in users continue into the app.
 */
export default async function HomePage() {
  const session = await auth();
  if (session?.user?.id) {
    const { isFeedEnabledForActiveNetwork } = await import("@/lib/feed/feed-enabled");
    redirect((await isFeedEnabledForActiveNetwork()) ? "/feed" : "/schedule");
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
      <Paper elevation={0} sx={{ ...brutalPaperSx, width: "100%", maxWidth: 520 }}>
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
          PolyCal
        </Typography>
        <Typography sx={{ mb: 2, color: GARDEN_TOKENS.inkMuted, textAlign: "center" }}>
          Private-group scheduling for polyamorous households: propose events and sleeping nights,
          vote with partners, follow a shared feed, and optionally sync confirmed plans to Google
          Calendar or download iCal files.
        </Typography>
        <Typography sx={{ mb: 3, color: GARDEN_TOKENS.inkMuted, textAlign: "center" }}>
          Accounts are created by your group administrator. Sign in when you have credentials.
        </Typography>
        <Stack spacing={1.5} alignItems="center">
          <Button component={NextLink} href="/login" variant="contained" size="large">
            Sign in
          </Button>
          <Typography variant="body2" sx={{ color: GARDEN_TOKENS.inkMuted }}>
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
  );
}
