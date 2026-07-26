"use client";

import { Box, Button, Paper, TextField, Typography } from "@mui/material";
import Link from "next/link";
import { useState } from "react";

import { requestNetworkSetupLinkAction } from "@/actions/networks";
import { brutalPaperSx } from "@/theme/brutalUi";
import { fontFamilies } from "@/theme/fonts";
import { GARDEN_TOKENS } from "@/theme/tokens";

/**
 * Self-serve network creation entry — emails a magic setup link (PC-360).
 */
export default function CreateNetworkPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [setupUrl, setSetupUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    setSetupUrl(null);
    const result = await requestNetworkSetupLinkAction(email);
    setBusy(false);
    setMessage(result.message);
    if (result.setupUrl) setSetupUrl(result.setupUrl);
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
      <Paper sx={{ ...brutalPaperSx, maxWidth: 420, width: "100%", p: 3 }}>
        <Typography
          variant="h5"
          sx={{ fontFamily: fontFamilies.display, mb: 1 }}
        >
          Create a network
        </Typography>
        <Typography variant="body2" sx={{ mb: 2, color: GARDEN_TOKENS.inkMuted }}>
          Enter your email. We will send a single-use link that expires in 15 minutes.
        </Typography>
        <Box component="form" onSubmit={onSubmit}>
          <TextField
            label="Email"
            type="email"
            required
            fullWidth
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            margin="normal"
          />
          <Button
            type="submit"
            variant="contained"
            fullWidth
            disabled={busy}
            sx={{
              mt: 2,
              bgcolor: GARDEN_TOKENS.sage,
              color: GARDEN_TOKENS.surface,
            }}
          >
            {busy ? "Sending…" : "Send setup link"}
          </Button>
        </Box>
        {message && (
          <Typography variant="body2" sx={{ mt: 2 }}>
            {message}
          </Typography>
        )}
        {setupUrl && (
          <Typography variant="body2" sx={{ mt: 1, wordBreak: "break-all" }}>
            <Link href={setupUrl}>Open setup wizard</Link>
          </Typography>
        )}
        <Button component={Link} href="/login" fullWidth sx={{ mt: 2 }}>
          Back to sign in
        </Button>
      </Paper>
    </Box>
  );
}
