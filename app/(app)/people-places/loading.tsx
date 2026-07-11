import { Box, CircularProgress } from "@mui/material";

/** Lightweight shell while People & Places data loads (PC-139). */
export default function PeoplePlacesLoading() {
  return (
    <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
      <CircularProgress aria-label="Loading people and places" />
    </Box>
  );
}
