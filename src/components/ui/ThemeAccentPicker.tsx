"use client";

import { Box, Stack, Typography } from "@mui/material";

import {
  USER_THEME_COLORS,
  USER_THEME_IDS,
  USER_THEME_LABELS,
  type UserThemeId,
} from "@/lib/constants/themes";
import { fontFamilies } from "@/theme/fonts";
import { GARDEN_TOKENS, STROKE_DEFAULT } from "@/theme/tokens";

/**
 * Playful Collective accent chips — Terracotta, Sage, Mustard, Lavender.
 */
export function ThemeAccentPicker({
  value,
  onChange,
}: {
  value: UserThemeId;
  onChange: (themeId: UserThemeId) => void;
}) {
  return (
    <Stack direction="row" flexWrap="wrap" gap={1.5} sx={{ mt: 1 }}>
      {USER_THEME_IDS.map((id) => {
        const selected = value === id;
        const color = USER_THEME_COLORS[id];
        return (
          <Box
            key={id}
            component="button"
            type="button"
            onClick={() => onChange(id)}
            aria-pressed={selected}
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 0.75,
              p: 1.5,
              minWidth: 88,
              cursor: "pointer",
              bgcolor: selected ? `${color}22` : GARDEN_TOKENS.surface,
              border: selected ? `2px solid ${GARDEN_TOKENS.ink}` : STROKE_DEFAULT,
              borderRadius: "16px 6px 14px 8px",
              boxShadow: "none",
              font: "inherit",
              color: GARDEN_TOKENS.ink,
              transition: "transform 0.12s ease",
              "&:hover": { transform: "translate(1px, 1px)" },
            }}
          >
            <Box
              sx={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                bgcolor: color,
                border: STROKE_DEFAULT,
              }}
            />
            <Typography
              variant="caption"
              sx={{
                fontFamily: fontFamilies.label,
                fontWeight: selected ? 700 : 600,
                letterSpacing: 0.3,
              }}
            >
              {USER_THEME_LABELS[id]}
            </Typography>
          </Box>
        );
      })}
    </Stack>
  );
}
