"use client";

import { Box, Typography } from "@mui/material";
import Image from "next/image";

import { fontFamilies } from "@/theme/fonts";
import { GARDEN_TOKENS } from "@/theme/tokens";

const ILLUSTRATIONS: Record<string, { src: string; width: number; height: number }> = {
  "schedule-day": {
    src: "/illustrations/empty-schedule-day.svg",
    width: 120,
    height: 100,
  },
  "proposals-archived": {
    src: "/illustrations/empty-proposals-archived.svg",
    width: 120,
    height: 100,
  },
};

export type EmptyStateIllustration = keyof typeof ILLUSTRATIONS;

/**
 * Lighthearted empty state with optional spot illustration (Garden Brutalism).
 */
export function EmptyState({
  illustration,
  title,
  description,
  compact = false,
  "data-testid": testId = "empty-state",
}: {
  illustration?: EmptyStateIllustration;
  title: string;
  description?: string;
  compact?: boolean;
  "data-testid"?: string;
}) {
  const art = illustration ? ILLUSTRATIONS[illustration] : undefined;

  return (
    <Box
      data-testid={testId}
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        py: compact ? 1.5 : 3,
        px: compact ? 1 : 2,
        gap: compact ? 0.75 : 1.5,
      }}
    >
      {art && (
        <Box sx={{ lineHeight: 0, opacity: 0.95 }}>
          <Image
            src={art.src}
            alt=""
            width={compact ? art.width * 0.75 : art.width}
            height={compact ? art.height * 0.75 : art.height}
            priority={false}
          />
        </Box>
      )}
      <Typography
        component="p"
        sx={{
          fontFamily: fontFamilies.display,
          fontWeight: 700,
          fontSize: compact ? "0.85rem" : "1rem",
          lineHeight: 1.3,
          color: GARDEN_TOKENS.ink,
          m: 0,
        }}
      >
        {title}
      </Typography>
      {description && (
        <Typography
          variant="caption"
          sx={{
            fontFamily: fontFamilies.body,
            color: GARDEN_TOKENS.inkMuted,
            maxWidth: 220,
            display: "block",
          }}
        >
          {description}
        </Typography>
      )}
    </Box>
  );
}
