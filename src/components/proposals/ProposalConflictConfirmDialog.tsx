"use client";

import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from "@mui/material";

import type { ProposalConflictWarning } from "@/actions/proposals";

import { primaryButtonSx } from "./proposalCardTheme";

/**
 * Renders conflict warning lines for draft/detail conflict UX (PC-132).
 */
export function ConflictWarningList({ warnings }: { warnings: ProposalConflictWarning[] }) {
  return (
    <>
      {warnings.map((warning, index) => (
        <Typography key={`${warning.userId}-${index}`} variant="body2" sx={{ mb: 0.5 }}>
          {warning.conflictKind === "place_asset" ? "Place" : warning.displayName} overlaps with
          &quot;{warning.conflictingTitle}&quot; ({warning.conflictingState})
        </Typography>
      ))}
    </>
  );
}

interface ProposalConflictConfirmDialogProps {
  open: boolean;
  warnings: ProposalConflictWarning[];
  pending: boolean;
  onClose: () => void;
  onSubmitAnyway: () => void;
}

/**
 * Nested confirm dialog when submit hits schedule conflicts (PC-132).
 */
export function ProposalConflictConfirmDialog({
  open,
  warnings,
  pending,
  onClose,
  onSubmitAnyway,
}: ProposalConflictConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="xs"
      aria-labelledby="draft-conflict-dialog-title"
    >
      <DialogTitle id="draft-conflict-dialog-title">Schedule conflicts detected</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          This proposal overlaps with existing calendar items. Review the conflicts below, then
          confirm if you still want to submit.
        </Typography>
        <Alert severity="warning">
          <ConflictWarningList warnings={warnings} />
        </Alert>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} color="inherit">
          Review draft
        </Button>
        <Button
          variant="contained"
          onClick={onSubmitAnyway}
          disabled={pending}
          sx={primaryButtonSx}
        >
          Submit anyway
        </Button>
      </DialogActions>
    </Dialog>
  );
}
