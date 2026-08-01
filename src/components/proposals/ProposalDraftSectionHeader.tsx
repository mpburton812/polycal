"use client";

import { Box, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";

import { POLY_GREEN } from "./proposalCardTheme";

/**
 * Compact section label used inside the proposal draft card (PC-132).
 */
export function ProposalDraftSectionHeader({
  icon,
  title,
  subtitle,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
      <Box sx={{ color: POLY_GREEN, display: "flex" }}>{icon}</Box>
      <Box>
        <Typography variant="subtitle2" sx={{ fontWeight: 600, color: POLY_GREEN }}>
          {title}
        </Typography>
        {subtitle && (
          <Typography variant="caption" color="text.secondary">
            {subtitle}
          </Typography>
        )}
      </Box>
    </Stack>
  );
}
