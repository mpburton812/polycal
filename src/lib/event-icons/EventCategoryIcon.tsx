"use client";

import { Box, type SxProps, type Theme } from "@mui/material";

import {
  getEventIconDefinition,
  type EventIconKey,
} from "@/lib/event-icons/registry";
import { GARDEN_TOKENS } from "@/theme/tokens";

interface EventCategoryIconProps {
  iconKey: EventIconKey;
  /** When true, expose the registry a11y label (calendar watermarks stay decorative). */
  labeled?: boolean;
  sx?: SxProps<Theme>;
}

const C = {
  ink: GARDEN_TOKENS.ink,
  sage: GARDEN_TOKENS.sage,
  terracotta: GARDEN_TOKENS.terracotta,
  mustard: GARDEN_TOKENS.mustard,
  lavender: GARDEN_TOKENS.lavender,
  cream: GARDEN_TOKENS.surface,
  foam: "#FFF8E7",
  crust: "#C47A3A",
  cheese: "#F2D56B",
  pepperoni: "#B83A2F",
  heart: "#C45A6A",
  heartDeep: "#9E3D4C",
  mic: "#4A5568",
  micLite: "#A0AEC0",
  meeple: "#3D6B9A",
  meepleLite: "#7BA3C9",
  beer: "#D4A017",
  beerDark: "#A67C0A",
  foamWhite: "#FFFDF8",
  leaf: "#3F6B48",
  leafLite: "#6B8F71",
  trunk: "#6B4F2A",
  flameOuter: "#E07A3A",
  flameInner: "#F2C14E",
  ball: "#E8E2D8",
  ballLine: "#5C534A",
  bucket: "#C96E5A",
  popcorn: "#F5E6A3",
  hat: "#8B7AB8",
  hatAccent: "#D4A017",
} as const;

/**
 * Multi-color event category SVG (PC-394). Watermark surfaces keep container opacity;
 * glyphs use fixed Garden Brutalism fills rather than currentColor.
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
            fill={C.crust}
            stroke={C.ink}
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path d="M16 48 L32 16 L48 48 Z" fill={C.cheese} />
          <path d="M18 48 L32 18 L46 48 Z" fill="none" stroke={C.foam} strokeWidth="1.2" opacity={0.5} />
          <circle cx="26" cy="34" r="3" fill={C.pepperoni} stroke={C.ink} strokeWidth="0.6" />
          <circle cx="36" cy="40" r="2.6" fill={C.pepperoni} stroke={C.ink} strokeWidth="0.6" />
          <circle cx="38" cy="30" r="2.4" fill={C.pepperoni} stroke={C.ink} strokeWidth="0.6" />
          <circle cx="30" cy="42" r="2" fill={C.sage} opacity={0.85} />
          <circle cx="33" cy="28" r="1.6" fill={C.sage} opacity={0.7} />
        </>
      );
    case "date_hearts":
      return (
        <>
          <path
            d="M20 22c0-5.2 3.8-9 8.2-9 2.8 0 5.1 1.6 6.3 4 1.2-2.4 3.5-4 6.3-4 4.4 0 8.2 3.8 8.2 9 0 10.5-14.5 18-14.5 18S20 32.5 20 22z"
            fill={C.heart}
            stroke={C.ink}
            strokeWidth="1.2"
          />
          <path
            d="M40 38c0-3.6 2.6-6.2 5.8-6.2 3.2 0 5.7 2.6 5.7 6.2 0 7.2-11.5 12.2-11.5 12.2S34.5 45.2 34.5 38 37 31.8 40 31.8c.5 0 1 .1 1.5.2C40.5 33.5 40 35.6 40 38z"
            fill={C.heartDeep}
            stroke={C.ink}
            strokeWidth="1"
          />
          <path
            d="M28 20c.8-1.2 2-2 3.4-2"
            fill="none"
            stroke={C.cream}
            strokeWidth="1.8"
            strokeLinecap="round"
            opacity={0.55}
          />
        </>
      );
    case "karaoke_mic":
      return (
        <>
          {/* Capsule centered on x=32; stand and base aligned to vertical midline (PC-402). */}
          <rect x="25" y="10" width="14" height="28" rx="7" fill={C.mic} stroke={C.ink} strokeWidth="1.2" />
          <rect x="29" y="14" width="6" height="16" rx="3" fill={C.micLite} opacity={0.85} />
          <path
            d="M21 32c0 8.5 4.9 14.5 11 14.5S43 40.5 43 32"
            fill="none"
            stroke={C.mustard}
            strokeWidth="3"
            strokeLinecap="round"
          />
          <line x1="32" y1="46.5" x2="32" y2="54" stroke={C.ink} strokeWidth="3" strokeLinecap="round" />
          <line x1="24" y1="54" x2="40" y2="54" stroke={C.ink} strokeWidth="3" strokeLinecap="round" />
        </>
      );
    case "gaming_meeple":
      return (
        <>
          <circle cx="32" cy="16" r="10" fill={C.meeple} stroke={C.ink} strokeWidth="1.2" />
          <path
            d="M16 54c0-10 7-17 16-17s16 7 16 17v4H16z"
            fill={C.meeple}
            stroke={C.ink}
            strokeWidth="1.2"
          />
          <path d="M22 40h20v4H22z" fill={C.meepleLite} opacity={0.7} />
          <circle cx="28" cy="14" r="2.2" fill={C.cream} />
          <circle cx="36" cy="14" r="2.2" fill={C.cream} />
          <path
            d="M28 20c1.2 1.4 2.8 2.2 4 2.2s2.8-.8 4-2.2"
            fill="none"
            stroke={C.cream}
            strokeWidth="1.6"
            strokeLinecap="round"
            opacity={0.7}
          />
        </>
      );
    case "bar_beer":
      return (
        <>
          <path
            d="M18 18h22v28c0 3.5-2.5 6-6 6H24c-3.5 0-6-2.5-6-6V18z"
            fill={C.beer}
            stroke={C.ink}
            strokeWidth="1.3"
          />
          <path
            d="M40 22h6c2.4 0 4.2 2 4.2 4.6v7.6c0 6.2-4 10.8-10.2 10.8"
            fill="none"
            stroke={C.beerDark}
            strokeWidth="2.8"
            strokeLinecap="round"
          />
          <rect x="22" y="20" width="14" height="8" rx="2" fill={C.foamWhite} />
          <path d="M22 38h14" stroke={C.beerDark} strokeWidth="2" opacity={0.45} />
          <path d="M20 16h18c1 0 2 1 2 2v2H18v-2c0-1 1-2 2-2z" fill={C.foamWhite} stroke={C.ink} strokeWidth="0.8" />
        </>
      );
    case "outdoors_tree":
      return (
        <>
          <rect x="29" y="46" width="6" height="10" rx="1" fill={C.trunk} stroke={C.ink} strokeWidth="0.8" />
          <path d="M18 48 L46 48 L32 30 Z" fill={C.leaf} stroke={C.ink} strokeWidth="1" />
          <path d="M20 36 L44 36 L32 18 Z" fill={C.leafLite} stroke={C.ink} strokeWidth="1" />
          <path d="M22 24 L42 24 L32 8 Z" fill={C.sage} stroke={C.ink} strokeWidth="1" />
          <path d="M28 20 L36 20" stroke={C.cream} strokeWidth="1.5" opacity={0.45} />
        </>
      );
    case "sexy_flame":
      return (
        <>
          <path
            d="M32 6c5 11 2.5 16 7.5 23 4 5.5 9.5 9 9.5 18 0 9.5-7 17-17 17s-17-7.5-17-17c0-9 6-12.5 9.5-18C29.5 22 27 17 32 6z"
            fill={C.flameOuter}
            stroke={C.ink}
            strokeWidth="1.2"
          />
          <path
            d="M32 26c2.5 5 1.2 7.5 3.8 11.5 2.2 3.5 4.7 5 4.7 9.2 0 5-3.8 8.8-8.5 8.8s-8.5-3.8-8.5-8.8c0-4.2 2.5-5.7 4.7-9.2C30.8 33.5 29.5 31 32 26z"
            fill={C.flameInner}
          />
        </>
      );
    case "sports_volleyball":
      return (
        <>
          <circle cx="32" cy="32" r="22" fill={C.ball} stroke={C.ink} strokeWidth="1.5" />
          <path
            d="M14 22c10 5.5 20 5.5 30 0M14 42c10-5.5 20-5.5 30 0M32 10v44"
            fill="none"
            stroke={C.ballLine}
            strokeWidth="2.4"
          />
          <path
            d="M18 16c8 6 20 6 28 0M18 48c8-6 20-6 28 0"
            fill="none"
            stroke={C.lavender}
            strokeWidth="1.8"
            opacity={0.7}
          />
        </>
      );
    case "movie_popcorn":
      return (
        <>
          <path d="M16 24h32l-5 32H21z" fill={C.bucket} stroke={C.ink} strokeWidth="1.2" />
          <path
            d="M20 24l3.5-10h5L26 24M29 24l3.5-10h5L35 24M38 24l3.5-10h5L44 24"
            fill={C.popcorn}
            stroke={C.ink}
            strokeWidth="0.8"
          />
          <circle cx="24" cy="16" r="3.2" fill={C.popcorn} stroke={C.ink} strokeWidth="0.7" />
          <circle cx="33" cy="14" r="3.5" fill={C.mustard} stroke={C.ink} strokeWidth="0.7" />
          <circle cx="42" cy="16" r="3.2" fill={C.popcorn} stroke={C.ink} strokeWidth="0.7" />
          <path d="M22 36h20" stroke={C.cream} strokeWidth="2.2" opacity={0.45} />
          <path d="M23 44h18" stroke={C.cream} strokeWidth="2.2" opacity={0.35} />
          <rect x="19" y="28" width="26" height="10" rx="2" fill={C.cream} opacity={0.35} />
        </>
      );
    case "party_hat":
      return (
        <>
          <path d="M12 50h40L32 8z" fill={C.hat} stroke={C.ink} strokeWidth="1.3" />
          <circle cx="32" cy="8" r="4.5" fill={C.hatAccent} stroke={C.ink} strokeWidth="1" />
          <circle cx="32" cy="8" r="2" fill={C.cream} />
          <path d="M18 42h28" stroke={C.mustard} strokeWidth="2.6" />
          <path d="M22 32h20" stroke={C.terracotta} strokeWidth="2.4" />
          <path d="M26 22h12" stroke={C.sage} strokeWidth="2.2" />
          <circle cx="24" cy="37" r="2" fill={C.mustard} />
          <circle cx="40" cy="27" r="2" fill={C.cream} />
        </>
      );
    default:
      return null;
  }
}
