import { Box, CircularProgress } from "@mui/material";

/** Shared route loading shell while tab RSC data loads (PC-139). */
export default function AppRouteLoading() {
  return (
    <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
      <CircularProgress aria-label="Loading" />
    </Box>
  );
}
