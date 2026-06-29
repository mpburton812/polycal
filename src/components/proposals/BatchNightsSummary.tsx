"use client";

import { Box, Stack, Typography } from "@mui/material";

import type { ProposalDetail } from "@/actions/proposals";
import { formatBatchNightLine } from "@/lib/proposals/batch-night-display";

import { POLY_GREEN, POLY_GREEN_LIGHT } from "./proposalCardTheme";

/**
 * Read-only list of per-night batch sleeping configuration in proposal detail (PC-69).
 */
export function BatchNightsSummary({ detail }: { detail: ProposalDetail }) {
  if (!detail.isBatchSleeping || detail.batchEntries.length === 0) {
    return null;
  }

  const inviteeNames = new Map(detail.invitees.map((invitee) => [invitee.userId, invitee.displayName]));
  const placeNames = new Map(Object.entries(detail.batchPlaceNames ?? {}));

  const nights = detail.batchEntries
    .filter((entry) => entry.nightDate.trim())
    .sort((a, b) => a.nightDate.localeCompare(b.nightDate));

  return (
    <Box sx={{ mt: 1.5, p: 1.5, bgcolor: POLY_GREEN_LIGHT, borderRadius: 1 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
        Batch nights ({nights.length})
      </Typography>
      <Stack spacing={0.75}>
        {nights.map((entry, index) => (
          <Typography key={entry.id} variant="body2" sx={{ color: POLY_GREEN }}>
            {formatBatchNightLine(entry, { inviteeNames, placeNames, nightIndex: index })}
          </Typography>
        ))}
      </Stack>
    </Box>
  );
}
