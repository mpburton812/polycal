import { Box, CircularProgress } from "@mui/material";

/** Lightweight shell while proposal data loads (PC-53 perf). */
export default function ProposalsLoading() {
  return (
    <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
      <CircularProgress aria-label="Loading proposals" />
    </Box>
  );
}
