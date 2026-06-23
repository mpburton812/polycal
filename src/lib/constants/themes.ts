import { createTheme, type Theme } from "@mui/material/styles";

export const USER_THEME_IDS = ["mint", "cinnamon", "blueberry", "sunflower"] as const;
export type UserThemeId = (typeof USER_THEME_IDS)[number];

const PALETTES: Record<UserThemeId, { primary: string; secondary: string }> = {
  mint: { primary: "#5c6bc0", secondary: "#26a69a" },
  cinnamon: { primary: "#8d6e63", secondary: "#d84315" },
  blueberry: { primary: "#3949ab", secondary: "#5c6bc0" },
  sunflower: { primary: "#f9a825", secondary: "#ff8f00" },
};

export const USER_THEME_LABELS: Record<UserThemeId, string> = {
  mint: "Mint",
  cinnamon: "Cinnamon",
  blueberry: "Blueberry",
  sunflower: "Sunflower",
};

/**
 * Builds an MUI theme from the user's accent preference (spec §3).
 */
export function createUserTheme(themeId: UserThemeId): Theme {
  const palette = PALETTES[themeId] ?? PALETTES.mint;
  return createTheme({
    palette: {
      mode: "light",
      primary: { main: palette.primary },
      secondary: { main: palette.secondary },
      background: { default: "#f5f5f5", paper: "#ffffff" },
    },
    typography: {
      fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    },
    components: {
      MuiAppBar: { defaultProps: { elevation: 1 } },
    },
  });
}

export function isUserThemeId(value: string): value is UserThemeId {
  return (USER_THEME_IDS as readonly string[]).includes(value);
}
