"use client";

import AccessTimeIcon from "@mui/icons-material/AccessTime";
import { Stack, Typography } from "@mui/material";
import { useEffect, useState } from "react";

import { GARDEN_TOKENS } from "@/theme/tokens";

import { formatCountdownRemaining } from "./proposalExpiryFormat";

export { formatCountdownRemaining } from "./proposalExpiryFormat";

interface ProposalExpiryCountdownProps {
  proposedExpiresAt?: string | null;
  atRisk?: boolean;
  atRiskExpiresAt?: string | null;
}

/**
 * Live proposed / at-risk expiry captions for Kanban summary cards (PC-294).
 */
export function ProposalExpiryCountdown({
  proposedExpiresAt,
  atRisk = false,
  atRiskExpiresAt = null,
}: ProposalExpiryCountdownProps) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  const soonestMs = [
    proposedExpiresAt ? Date.parse(proposedExpiresAt) : NaN,
    atRisk && atRiskExpiresAt ? Date.parse(atRiskExpiresAt) : NaN,
  ].filter((value) => !Number.isNaN(value));
  const tickMs =
    soonestMs.length > 0 && Math.min(...soonestMs) - nowMs < 60 * 60 * 1000 ? 1000 : 30_000;

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), tickMs);
    return () => window.clearInterval(id);
  }, [tickMs]);

  if (!proposedExpiresAt && !(atRisk && atRiskExpiresAt)) {
    return null;
  }

  return (
    <Stack spacing={0.25} sx={{ mt: 0.75 }}>
      {proposedExpiresAt && (
        <Stack direction="row" spacing={0.5} alignItems="center">
          <AccessTimeIcon sx={{ fontSize: 14, color: GARDEN_TOKENS.inkMuted }} />
          <Typography variant="caption" sx={{ color: GARDEN_TOKENS.inkMuted }}>
            Expires in {formatCountdownRemaining(proposedExpiresAt, nowMs)}
          </Typography>
        </Stack>
      )}
      {atRisk && atRiskExpiresAt && (
        <Typography variant="caption" sx={{ color: GARDEN_TOKENS.inkMuted, pl: 2.5 }}>
          Risk window · {formatCountdownRemaining(atRiskExpiresAt, nowMs)} left
        </Typography>
      )}
    </Stack>
  );
}
