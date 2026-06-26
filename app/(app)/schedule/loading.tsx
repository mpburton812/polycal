import { Box, CircularProgress } from "@mui/material";

/** Lightweight shell while schedule data loads (PC-53 perf). */
export default function ScheduleLoading() {
  return (
    <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
      <CircularProgress aria-label="Loading schedule" />
    </Box>
  );
}
