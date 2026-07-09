"use client";

import { Box, type SxProps, type Theme } from "@mui/material";

interface EventSocialIconProps {
  sx?: SxProps<Theme>;
}

/**
 * Watermark icon for social events — microphone, pizza slice, and pine tree (PC-114).
 * Mirrors the sleeping BedIcon treatment in week/month schedule views.
 */
export function EventSocialIcon({ sx }: EventSocialIconProps) {
  return (
    <Box
      component="svg"
      viewBox="0 0 64 64"
      aria-hidden
      sx={{ width: "1em", height: "1em", display: "block", ...sx }}
    >
      {/* Microphone — left */}
      <rect x="10" y="22" width="10" height="18" rx="5" fill="currentColor" />
      <path
        d="M8 34c0 7 4.5 12 12 12s12-5 12-12"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <line x1="20" y1="46" x2="20" y2="54" stroke="currentColor" strokeWidth="2.5" />
      <line x1="14" y1="54" x2="26" y2="54" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />

      {/* Pizza slice — center */}
      <path d="M30 48 L42 18 L54 48 Z" fill="currentColor" opacity={0.92} />
      <circle cx="38" cy="36" r="2.2" fill="white" opacity={0.55} />
      <circle cx="44" cy="40" r="2" fill="white" opacity={0.55} />
      <circle cx="36" cy="42" r="1.8" fill="white" opacity={0.55} />

      {/* Pine tree — right */}
      <path d="M50 48 L56 48 L53 40 Z" fill="currentColor" />
      <path d="M47 40 L59 40 L53 28 Z" fill="currentColor" opacity={0.9} />
      <path d="M49 28 L57 28 L53 16 Z" fill="currentColor" opacity={0.8} />
      <rect x="51.5" y="48" width="3" height="6" fill="currentColor" />
    </Box>
  );
}
