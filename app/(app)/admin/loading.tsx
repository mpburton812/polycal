import { Box, CircularProgress } from "@mui/material";

/** Lightweight shell while Admin data loads (PC-139). */
export default function AdminLoading() {
  return (
    <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
      <CircularProgress aria-label="Loading admin" />
    </Box>
  );
}
