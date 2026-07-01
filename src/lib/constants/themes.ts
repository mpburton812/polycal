import { createTheme, type Theme } from "@mui/material/styles";

import { fontFamilies } from "@/theme/fonts";
import { GARDEN_TOKENS } from "@/theme/tokens";
import { polycalTheme } from "@/theme/theme";

/** Playful Collective accent options shown in profile and onboarding. */
export const USER_THEME_IDS = ["terracotta", "sage", "mustard", "lavender"] as const;
export type UserThemeId = (typeof USER_THEME_IDS)[number];

/** Legacy stored values — mapped to Playful Collective accents on read. */
export const LEGACY_USER_THEME_IDS = ["mint", "cinnamon", "blueberry", "sunflower"] as const;
export type LegacyUserThemeId = (typeof LEGACY_USER_THEME_IDS)[number];
export type StoredUserThemeId = UserThemeId | LegacyUserThemeId;

const LEGACY_THEME_MAP: Record<LegacyUserThemeId, UserThemeId> = {
  mint: "sage",
  cinnamon: "terracotta",
  blueberry: "lavender",
  sunflower: "mustard",
};

export const USER_THEME_COLORS: Record<UserThemeId, string> = {
  terracotta: GARDEN_TOKENS.terracotta,
  sage: GARDEN_TOKENS.sage,
  mustard: GARDEN_TOKENS.mustard,
  lavender: GARDEN_TOKENS.lavender,
};

const PALETTES: Record<UserThemeId, { primary: string; secondary: string }> = {
  terracotta: { primary: GARDEN_TOKENS.terracotta, secondary: GARDEN_TOKENS.mustard },
  sage: { primary: GARDEN_TOKENS.sage, secondary: GARDEN_TOKENS.mustard },
  mustard: { primary: GARDEN_TOKENS.mustard, secondary: GARDEN_TOKENS.terracotta },
  lavender: { primary: GARDEN_TOKENS.lavender, secondary: GARDEN_TOKENS.sage },
};

export const USER_THEME_LABELS: Record<UserThemeId, string> = {
  terracotta: "Terracotta",
  sage: "Sage",
  mustard: "Mustard",
  lavender: "Lavender",
};

/**
 * Normalizes a stored theme id (including legacy mint/blueberry) to a Playful Collective accent.
 */
export function normalizeUserThemeId(value: string): UserThemeId {
  if ((USER_THEME_IDS as readonly string[]).includes(value)) {
    return value as UserThemeId;
  }
  if ((LEGACY_USER_THEME_IDS as readonly string[]).includes(value)) {
    return LEGACY_THEME_MAP[value as LegacyUserThemeId];
  }
  return "sage";
}

export function isUserThemeId(value: string): value is StoredUserThemeId {
  return (
    (USER_THEME_IDS as readonly string[]).includes(value) ||
    (LEGACY_USER_THEME_IDS as readonly string[]).includes(value)
  );
}

/**
 * Builds an MUI theme from the user's accent preference on top of Garden Brutalism base.
 */
export function createUserTheme(themeId: StoredUserThemeId): Theme {
  const normalized = normalizeUserThemeId(themeId);
  const palette = PALETTES[normalized];
  return createTheme(polycalTheme, {
    palette: {
      primary: { main: palette.primary, contrastText: GARDEN_TOKENS.surface },
      secondary: { main: palette.secondary, contrastText: GARDEN_TOKENS.ink },
    },
    typography: {
      fontFamily: fontFamilies.body,
    },
  });
}
