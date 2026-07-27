"use client";

import { Box, Typography } from "@mui/material";

import {
  getAppEnvironment,
  getBuildBranch,
  getBuildSha,
  getEnvironmentBannerColors,
} from "@/lib/env";

/**
 * Environment banner: fixed tier colors (not user theme).
 */
export function DevBar() {
  const environment = getAppEnvironment();
  const banner = getEnvironmentBannerColors();

  return (
    <Box
      component="section"
      aria-label="Environment banner"
      sx={{
        bgcolor: banner.background,
        color: banner.color,
        px: 2,
        py: 0.75,
        display: "flex",
        alignItems: "center",
        borderBottom: 1,
        borderColor: banner.border,
      }}
    >
      <Typography variant="caption" sx={{ color: "inherit" }}>
        PolyCal · {environment.toUpperCase()} · Build {getBuildSha()} · Branch{" "}
        {getBuildBranch()}
      </Typography>
    </Box>
  );
}
