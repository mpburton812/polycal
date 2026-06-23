"use client";

import { ThemeProvider } from "@mui/material/styles";
import { useMemo } from "react";

import { createUserTheme, isUserThemeId } from "@/lib/constants/themes";

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
    () => createUserTheme(isUserThemeId(themeId) ? themeId : "mint"),
    [themeId],
  );

  return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
}
