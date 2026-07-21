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
 * Renders a single event category watermark SVG in Garden Brutalism ink style (PC-116 / PC-275).
 * Paths are drawn at higher detail for large kanban watermarks while staying crisp at small sizes.
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
          <path
            d="M10 50 L32 8 L54 50 Z"
            fill="currentColor"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path d="M18 48 L32 18 L46 48 Z" fill="none" stroke="white" strokeWidth="1.5" opacity={0.35} />
          <circle cx="26" cy="34" r="2.8" fill="white" opacity={0.7} />
          <circle cx="36" cy="40" r="2.4" fill="white" opacity={0.7} />
          <circle cx="38" cy="30" r="2.2" fill="white" opacity={0.65} />
          <circle cx="30" cy="42" r="1.8" fill="white" opacity={0.55} />
        </>
      );
    case "date_hearts":
      return (
        <>
          <path
            d="M20 22c0-5.2 3.8-9 8.2-9 2.8 0 5.1 1.6 6.3 4 1.2-2.4 3.5-4 6.3-4 4.4 0 8.2 3.8 8.2 9 0 10.5-14.5 18-14.5 18S20 32.5 20 22z"
            fill="currentColor"
          />
          <path
            d="M40 38c0-3.6 2.6-6.2 5.8-6.2 3.2 0 5.7 2.6 5.7 6.2 0 7.2-11.5 12.2-11.5 12.2S34.5 45.2 34.5 38 37 31.8 40 31.8c.5 0 1 .1 1.5.2C40.5 33.5 40 35.6 40 38z"
            fill="currentColor"
            opacity={0.88}
          />
          <path
            d="M28 20c.8-1.2 2-2 3.4-2"
            fill="none"
            stroke="white"
            strokeWidth="1.8"
            strokeLinecap="round"
            opacity={0.4}
          />
        </>
      );
    case "karaoke_mic":
      return (
        <>
          <rect x="25" y="12" width="14" height="26" rx="7" fill="currentColor" />
          <rect x="28" y="16" width="8" height="14" rx="4" fill="white" opacity={0.28} />
          <path
            d="M20 30c0 9.4 5.8 16.5 14.5 16.5S49 39.4 49 30"
            fill="none"
            stroke="currentColor"
            strokeWidth="3.2"
            strokeLinecap="round"
          />
          <line x1="32" y1="46.5" x2="32" y2="54" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
          <line x1="22" y1="54" x2="42" y2="54" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
        </>
      );
    case "gaming_meeple":
      return (
        <>
          <circle cx="32" cy="16" r="10" fill="currentColor" />
          <path
            d="M16 54c0-10 7-17 16-17s16 7 16 17v4H16z"
            fill="currentColor"
          />
          <path d="M22 40h20v4H22z" fill="white" opacity={0.2} />
          <circle cx="28" cy="14" r="2.2" fill="white" opacity={0.55} />
          <circle cx="36" cy="14" r="2.2" fill="white" opacity={0.55} />
          <path
            d="M28 20c1.2 1.4 2.8 2.2 4 2.2s2.8-.8 4-2.2"
            fill="none"
            stroke="white"
            strokeWidth="1.6"
            strokeLinecap="round"
            opacity={0.45}
          />
        </>
      );
    case "bar_beer":
      return (
        <>
          <path
            d="M20 18h22v28c0 3.5-2.5 6-6 6H26c-3.5 0-6-2.5-6-6V18z"
            fill="currentColor"
          />
          <path
            d="M42 22h7c2.8 0 5 2.4 5 5.4v8.2c0 7.2-4.8 12.4-12 12.4"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <rect x="24" y="22" width="14" height="10" rx="2" fill="white" opacity={0.32} />
          <path d="M24 38h14" stroke="white" strokeWidth="2" opacity={0.25} />
        </>
      );
    case "outdoors_tree":
      return (
        <>
          <rect x="29" y="46" width="6" height="10" rx="1" fill="currentColor" />
          <path d="M18 48 L46 48 L32 30 Z" fill="currentColor" />
          <path d="M20 36 L44 36 L32 18 Z" fill="currentColor" opacity={0.92} />
          <path d="M22 24 L42 24 L32 8 Z" fill="currentColor" opacity={0.84} />
          <path d="M28 20 L36 20" stroke="white" strokeWidth="1.5" opacity={0.3} />
        </>
      );
    case "sexy_flame":
      return (
        <>
          <path
            d="M32 6c5 11 2.5 16 7.5 23 4 5.5 9.5 9 9.5 18 0 9.5-7 17-17 17s-17-7.5-17-17c0-9 6-12.5 9.5-18C29.5 22 27 17 32 6z"
            fill="currentColor"
          />
          <path
            d="M32 26c2.5 5 1.2 7.5 3.8 11.5 2.2 3.5 4.7 5 4.7 9.2 0 5-3.8 8.8-8.5 8.8s-8.5-3.8-8.5-8.8c0-4.2 2.5-5.7 4.7-9.2C30.8 33.5 29.5 31 32 26z"
            fill="white"
            opacity={0.38}
          />
        </>
      );
    case "sports_volleyball":
      return (
        <>
          <circle cx="32" cy="32" r="22" fill="currentColor" />
          <path
            d="M14 22c10 5.5 20 5.5 30 0M14 42c10-5.5 20-5.5 30 0M32 10v44"
            fill="none"
            stroke="white"
            strokeWidth="2.4"
            opacity={0.48}
          />
          <path
            d="M18 16c8 6 20 6 28 0M18 48c8-6 20-6 28 0"
            fill="none"
            stroke="white"
            strokeWidth="1.8"
            opacity={0.28}
          />
        </>
      );
    case "movie_popcorn":
      return (
        <>
          <path d="M16 24h32l-5 32H21z" fill="currentColor" />
          <path
            d="M20 24l3.5-10h5L26 24M29 24l3.5-10h5L35 24M38 24l3.5-10h5L44 24"
            fill="currentColor"
            opacity={0.9}
          />
          <path d="M22 36h20" stroke="white" strokeWidth="2.2" opacity={0.28} />
          <path d="M23 44h18" stroke="white" strokeWidth="2.2" opacity={0.22} />
          <rect x="19" y="28" width="26" height="12" rx="2" fill="white" opacity={0.22} />
        </>
      );
    case "party_hat":
      return (
        <>
          <path d="M12 50h40L32 8z" fill="currentColor" />
          <circle cx="32" cy="8" r="4.5" fill="currentColor" />
          <circle cx="32" cy="8" r="2" fill="white" opacity={0.45} />
          <path d="M18 42h28" stroke="white" strokeWidth="2.4" opacity={0.4} />
          <path d="M22 32h20" stroke="white" strokeWidth="2.4" opacity={0.35} />
          <path d="M26 22h12" stroke="white" strokeWidth="2.2" opacity={0.3} />
        </>
      );
    default:
      return null;
  }
}
