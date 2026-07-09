"use client";

import { Box, type SxProps, type Theme } from "@mui/material";

import {
  getEventIconDefinition,
  type EventIconKey,
} from "@/lib/event-icons/registry";

interface EventCategoryIconProps {
  iconKey: EventIconKey;
  /** When true, expose the registry a11y label (calendar watermarks stay decorative). */
  labeled?: boolean;
  sx?: SxProps<Theme>;
}

/**
 * Renders a single event category watermark SVG in Garden Brutalism ink style (PC-116).
 */
export function EventCategoryIcon({ iconKey, labeled = false, sx }: EventCategoryIconProps) {
  const definition = getEventIconDefinition(iconKey);
  const ariaProps = labeled && definition
    ? { role: "img" as const, "aria-label": definition.a11yLabel }
    : { "aria-hidden": true as const };

  return (
    <Box
      component="svg"
      viewBox="0 0 64 64"
      {...ariaProps}
      sx={{ width: "1em", height: "1em", display: "block", ...sx }}
    >
      {renderIconPaths(iconKey)}
    </Box>
  );
}

function renderIconPaths(iconKey: EventIconKey) {
  switch (iconKey) {
    case "food_pizza":
      return (
        <>
          <path d="M14 46 L32 14 L50 46 Z" fill="currentColor" />
          <circle cx="28" cy="34" r="2.5" fill="white" opacity={0.55} />
          <circle cx="36" cy="38" r="2.2" fill="white" opacity={0.55} />
          <circle cx="40" cy="30" r="2" fill="white" opacity={0.55} />
        </>
      );
    case "date_hearts":
      return (
        <>
          <path
            d="M22 20c0-4 3-7 7-7 3 0 5 2 6 4 1-2 3-4 6-4 4 0 7 3 7 7 0 8-13 14-13 14S22 28 22 20z"
            fill="currentColor"
          />
          <path
            d="M42 36c0-3 2-5 5-5 3 0 5 2 5 5 0 6-10 10-10 10s-10-4-10-10z"
            fill="currentColor"
            opacity={0.85}
          />
        </>
      );
    case "karaoke_mic":
      return (
        <>
          <rect x="26" y="16" width="12" height="22" rx="6" fill="currentColor" />
          <path
            d="M22 30c0 8 5 14 14 14s14-6 14-14"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <line x1="32" y1="44" x2="32" y2="54" stroke="currentColor" strokeWidth="3" />
          <line x1="24" y1="54" x2="40" y2="54" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </>
      );
    case "gaming_meeple":
      return (
        <>
          <circle cx="32" cy="18" r="9" fill="currentColor" />
          <path d="M18 50c0-8 6-14 14-14s14 6 14 14v6H18z" fill="currentColor" />
          <circle cx="26" cy="16" r="2" fill="white" opacity={0.5} />
          <circle cx="38" cy="16" r="2" fill="white" opacity={0.5} />
        </>
      );
    case "bar_beer":
      return (
        <>
          <rect x="22" y="18" width="20" height="30" rx="3" fill="currentColor" />
          <rect x="26" y="22" width="12" height="8" fill="white" opacity={0.35} />
          <path
            d="M42 24h6c2 0 3 2 3 4v8c0 6-4 10-10 10"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </>
      );
    case "outdoors_tree":
      return (
        <>
          <path d="M28 48 L36 48 L32 36 Z" fill="currentColor" />
          <path d="M24 36 L40 36 L32 22 Z" fill="currentColor" opacity={0.9} />
          <path d="M26 24 L38 24 L32 10 Z" fill="currentColor" opacity={0.8} />
          <rect x="30" y="48" width="4" height="8" fill="currentColor" />
        </>
      );
    case "sexy_flame":
      return (
        <>
          <path
            d="M32 10c4 10 2 14 6 20 3 5 8 8 8 16 0 8-6 14-14 14s-14-6-14-14c0-8 5-11 8-16 4-6 2-10 6-20z"
            fill="currentColor"
          />
          <path
            d="M32 30c2 4 1 6 3 9 2 3 4 4 4 8 0 4-3 7-7 7s-7-3-7-7c0-4 2-5 4-8 2-3 1-5 3-9z"
            fill="white"
            opacity={0.35}
          />
        </>
      );
    case "sports_volleyball":
      return (
        <>
          <circle cx="32" cy="32" r="20" fill="currentColor" />
          <path
            d="M16 24c8 4 16 4 24 0M16 40c8-4 16-4 24 0M32 12v40"
            fill="none"
            stroke="white"
            strokeWidth="2.5"
            opacity={0.45}
          />
        </>
      );
    case "movie_popcorn":
      return (
        <>
          <path d="M18 22h28l-4 30H22z" fill="currentColor" />
          <path d="M22 22l3-8h4l-2 8M30 22l3-8h4l-2 8M38 22l3-8h4l-2 8" fill="currentColor" opacity={0.85} />
          <rect x="20" y="30" width="24" height="14" rx="2" fill="white" opacity={0.25} />
        </>
      );
    case "party_hat":
      return (
        <>
          <path d="M14 48h36L32 12z" fill="currentColor" />
          <circle cx="32" cy="12" r="4" fill="currentColor" />
          <path d="M20 40h24" stroke="white" strokeWidth="2.5" opacity={0.4} />
          <path d="M24 32h16" stroke="white" strokeWidth="2.5" opacity={0.35} />
        </>
      );
    default:
      return null;
  }
}
