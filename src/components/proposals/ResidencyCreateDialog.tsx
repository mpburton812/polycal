"use client";

import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Typography,
} from "@mui/material";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { createResidencyDraftProposalAction } from "@/actions/residency-proposals";
import type { ProposalPlaceOption } from "@/actions/proposals";
import type { PersonSummary } from "@/actions/users";
import { useToast } from "@/components/providers/ToastProvider";

import { primaryButtonSx } from "./proposalCardTheme";

interface ResidencyCreateDialogProps {
  open: boolean;
  onClose: () => void;
  people: PersonSummary[];
  places: ProposalPlaceOption[];
  currentUserId: string;
}

/**
 * Creates a residency draft (or submits immediately) from the Proposals hub (PC-60).
 */
export function ResidencyCreateDialog({
  open,
  onClose,
  people,
  places,
  currentUserId,
}: ResidencyCreateDialogProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [locationId, setLocationId] = useState("");
  const [targetUserId, setTargetUserId] = useState("");
  const [pending, startTransition] = useTransition();

  const candidates = useMemo(
    () => people.filter((person) => person.status === "active"),
    [people],
  );

  function handleClose() {
    setLocationId("");
    setTargetUserId("");
    onClose();
  }

  function handleCreate(immediate: boolean) {
    if (!locationId || !targetUserId) return;
    startTransition(async () => {
      const result = await createResidencyDraftProposalAction({
        locationId,
        targetUserId,
        submitImmediately: immediate,
      });
      showToast(result.message, result.ok ? "success" : "error");
      if (!result.ok) return;
      handleClose();
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="xs">
      <DialogTitle>Place residency proposal</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Alert severity="info" sx={{ py: 0.5 }}>
            Visible only to the proposer, invitee, and admins.
          </Alert>
          <FormControl fullWidth size="small">
            <InputLabel id="residency-place-label">Place</InputLabel>
            <Select
              labelId="residency-place-label"
              label="Place"
              value={locationId}
              onChange={(event) => setLocationId(event.target.value)}
            >
              {places.map((place) => (
                <MenuItem key={place.id} value={place.id}>
                  {place.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl fullWidth size="small">
            <InputLabel id="residency-user-label">Resident</InputLabel>
            <Select
              labelId="residency-user-label"
              label="Resident"
              value={targetUserId}
              onChange={(event) => setTargetUserId(event.target.value)}
            >
              {candidates.map((person) => (
                <MenuItem key={person.id} value={person.id}>
                  {person.displayName}
                  {person.id === currentUserId ? " (you)" : ""}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Typography variant="body2" color="text.secondary">
            Save as draft to review later, or submit now to notify the invitee.
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose} color="inherit">
          Cancel
        </Button>
        <Button
          variant="text"
          disabled={pending || !locationId || !targetUserId}
          onClick={() => handleCreate(false)}
        >
          Save draft
        </Button>
        <Button
          variant="contained"
          disabled={pending || !locationId || !targetUserId}
          onClick={() => handleCreate(true)}
          sx={primaryButtonSx}
        >
          Submit
        </Button>
      </DialogActions>
    </Dialog>
  );
}
