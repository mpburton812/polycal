"use client";

import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";

import { AuthSessionProvider } from "@/components/providers/AuthSessionProvider";
import { ThemeRegistry } from "@/components/providers/ThemeRegistry";
import { polycalTheme } from "@/theme/theme";

/** Client boundary for MUI theme + session — keeps functions out of the RSC tree. */
export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeRegistry>
      <ThemeProvider theme={polycalTheme}>
        <CssBaseline />
        <AuthSessionProvider>{children}</AuthSessionProvider>
      </ThemeProvider>
    </ThemeRegistry>
  );
}
