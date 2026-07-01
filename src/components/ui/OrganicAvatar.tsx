"use client";

import { Avatar, Box } from "@mui/material";

import { GARDEN_TOKENS } from "@/theme/tokens";

/** Deterministic blob radii from a stable key (display name or avatar key). */
const BLOB_SHAPES = [
  "58% 42% 52% 48% / 48% 55% 45% 52%",
  "45% 55% 60% 40% / 52% 48% 58% 42%",
  "52% 48% 44% 56% / 42% 58% 48% 52%",
  "48% 52% 55% 45% / 55% 45% 50% 50%",
] as const;

function blobRadiusForKey(key: string): string {
  const sum = key.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return BLOB_SHAPES[sum % BLOB_SHAPES.length] ?? BLOB_SHAPES[0];
}

/**
 * Profile avatar with organic blob clip and ink ring (Garden Brutalism).
 */
export function OrganicAvatar({
  src,
  alt,
  label,
  size = 32,
}: {
  src?: string;
  alt: string;
  label: string;
  size?: number;
}) {
  const blobKey = src ?? label;
  const borderRadius = blobRadiusForKey(blobKey);

  return (
    <Box
      sx={{
        display: "inline-flex",
        p: "2px",
        borderRadius,
        border: `2px solid ${GARDEN_TOKENS.ink}`,
        bgcolor: GARDEN_TOKENS.surface,
        lineHeight: 0,
      }}
    >
      <Avatar
        src={src}
        alt={alt}
        sx={{
          width: size,
          height: size,
          borderRadius,
          bgcolor: GARDEN_TOKENS.lavender,
          color: GARDEN_TOKENS.ink,
          fontFamily: "var(--font-space-grotesk), sans-serif",
          fontWeight: 700,
          fontSize: size * 0.4,
        }}
      >
        {label.charAt(0).toUpperCase()}
      </Avatar>
    </Box>
  );
}
