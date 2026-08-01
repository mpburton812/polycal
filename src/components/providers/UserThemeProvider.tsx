"use client";

import { ThemeProvider } from "@mui/material/styles";
import { useMemo } from "react";

import { createUserTheme, normalizeUserThemeId } from "@/lib/constants/themes";

/**
 * Applies per-user MUI accent theme inside the authenticated shell.
 */
export function UserThemeProvider({
  themeId,
  children,
}: {
  themeId: string;
  children: React.ReactNode;
}) {
  const theme = useMemo(
    () => createUserTheme(normalizeUserThemeId(themeId)),
    [themeId],
  );

  return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
}
