"use client";

import { useEffect, useRef } from "react";
import { Box, Button, Paper, Typography } from "@mui/material";

import { redeemEmailLoginAction } from "@/actions/email-login";
import { brutalPaperSx } from "@/theme/brutalUi";
import { fontFamilies } from "@/theme/fonts";
import { GARDEN_TOKENS } from "@/theme/tokens";

/**
 * Auto-submits the email-login redeem action so magic links sign in without
 * a second click, while still running inside a server action (PC-465).
 */
export function EmailLoginRedeemForm({ token }: { token: string }) {
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    formRef.current?.requestSubmit();
  }, []);

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
      <Paper elevation={0} sx={{ ...brutalPaperSx, width: "100%", maxWidth: 400 }}>
        <Typography
          variant="h5"
          component="h1"
          sx={{ fontFamily: fontFamilies.display, fontWeight: 700, mb: 2 }}
        >
          Signing in…
        </Typography>
        <form ref={formRef} action={redeemEmailLoginAction}>
          <input type="hidden" name="token" value={token} />
          <Button type="submit" variant="contained" fullWidth>
            Continue to PolyCal
          </Button>
        </form>
      </Paper>
    </Box>
  );
}
