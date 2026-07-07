"use client";

import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from "@mui/material";

interface SeriesOccurrenceChooserDialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  onViewOccurrence: () => void;
  onViewSeries: () => void;
}

/**
 * Unified tap UX for recurrence — choose occurrence detail vs parent series.
 */
export function SeriesOccurrenceChooserDialog({
  open,
  title,
  onClose,
  onViewOccurrence,
  onViewSeries,
}: SeriesOccurrenceChooserDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Recurring event</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {title}
        </Typography>
        <Typography variant="body2">
          Open this occurrence or the full recurring series?
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, flexDirection: "column", alignItems: "stretch", gap: 1 }}>
        <Button variant="contained" onClick={onViewOccurrence}>
          This occurrence
        </Button>
        <Button variant="outlined" onClick={onViewSeries}>
          Full series
        </Button>
        <Button onClick={onClose}>Cancel</Button>
      </DialogActions>
    </Dialog>
  );
}
