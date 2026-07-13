import { Box, CircularProgress, Typography } from "@mui/material";

import { fontFamilies } from "@/theme/fonts";
import { GARDEN_TOKENS } from "@/theme/tokens";

/**
 * Garden-branded route/shell loader so users see the app is working on cold start
 * and tab navigations (PC-202).
 */
export function BrandedLoading({
  label = "Loading PolyCal…",
  fullPage = false,
}: {
  label?: string;
  fullPage?: boolean;
}) {
  return (
    <Box
      role="status"
      aria-live="polite"
      aria-busy="true"
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
        py: fullPage ? 0 : 8,
        minHeight: fullPage ? "100dvh" : undefined,
        width: "100%",
        bgcolor: GARDEN_TOKENS.background,
        backgroundImage: `radial-gradient(ellipse at 20% 0%, ${GARDEN_TOKENS.sage}22 0%, transparent 55%),
          radial-gradient(ellipse at 80% 100%, ${GARDEN_TOKENS.mustard}18 0%, transparent 50%)`,
      }}
    >
      <Typography
        component="p"
        sx={{
          fontFamily: fontFamilies.display,
          fontWeight: 700,
          fontSize: "1.75rem",
          letterSpacing: "-0.02em",
          color: GARDEN_TOKENS.ink,
          m: 0,
        }}
      >
        PolyCal
      </Typography>
      <CircularProgress
        size={36}
        thickness={4}
        aria-label={label}
        sx={{ color: GARDEN_TOKENS.sage }}
      />
      <Typography
        variant="body2"
        sx={{
          fontFamily: fontFamilies.label,
          color: GARDEN_TOKENS.inkMuted,
          fontWeight: 600,
        }}
      >
        {label}
      </Typography>
    </Box>
  );
}
