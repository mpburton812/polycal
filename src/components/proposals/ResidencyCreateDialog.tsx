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
import { useEffect, useMemo, useState, useTransition } from "react";

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
  /** When true, target is locked to self (non-admin self-join). */
  lockTargetToSelf?: boolean;
}

/**
 * Creates a residency self-join draft for owner approval (PC-188 / PC-190).
 */
export function ResidencyCreateDialog({
  open,
  onClose,
  people,
  places,
  currentUserId,
  lockTargetToSelf = true,
}: ResidencyCreateDialogProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [locationId, setLocationId] = useState("");
  const [targetUserId, setTargetUserId] = useState(
    lockTargetToSelf ? currentUserId : "",
  );
  const [placeRole, setPlaceRole] = useState<"" | "owner" | "resident">("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (open && lockTargetToSelf) {
      setTargetUserId(currentUserId);
    }
  }, [open, lockTargetToSelf, currentUserId]);

  useEffect(() => {
    if (!open) {
      setPlaceRole("");
    }
  }, [open]);

  const candidates = useMemo(
    () => people.filter((person) => person.status === "active"),
    [people],
  );

  const selectedPlace = places.find((place) => place.id === locationId);

  function handleClose() {
    setLocationId("");
    setTargetUserId(lockTargetToSelf ? currentUserId : "");
    setPlaceRole("");
    onClose();
  }

  function handleCreate(immediate: boolean) {
    if (!locationId || !targetUserId || !placeRole) return;
    startTransition(async () => {
      const result = await createResidencyDraftProposalAction({
        locationId,
        targetUserId,
        placeRole,
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
            Place owners must approve. You receive the access level you choose below.
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
          {selectedPlace && (
            <Typography variant="body2" color="text.secondary">
              Owners:{" "}
              {selectedPlace.owners && selectedPlace.owners.length > 0
                ? selectedPlace.owners.join(", ")
                : "none"}
              {" · "}
              Residents:{" "}
              {selectedPlace.residents && selectedPlace.residents.length > 0
                ? selectedPlace.residents.join(", ")
                : "none"}
            </Typography>
          )}
          <FormControl fullWidth size="small" required>
            <InputLabel id="residency-role-label">Access level</InputLabel>
            <Select
              labelId="residency-role-label"
              label="Access level"
              value={placeRole}
              onChange={(event) =>
                setPlaceRole(event.target.value as "owner" | "resident")
              }
            >
              <MenuItem value="resident">Resident</MenuItem>
              <MenuItem value="owner">Owner</MenuItem>
            </Select>
          </FormControl>
          <Typography variant="body2" color="text.secondary" component="div">
            <strong>Owner</strong> — can add or remove people, edit place details, and
            approve residency requests. Shares responsibility with other owners.
            <br />
            <strong>Resident</strong> — can use and edit the place but cannot manage
            membership or approve residency requests.
          </Typography>
          <FormControl fullWidth size="small">
            <InputLabel id="residency-user-label">Person</InputLabel>
            <Select
              labelId="residency-user-label"
              label="Person"
              value={targetUserId}
              disabled={lockTargetToSelf}
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
            Save as draft to review later, or submit now to notify place owners.
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose} color="inherit">
          Cancel
        </Button>
        <Button
          variant="text"
          disabled={pending || !locationId || !targetUserId || !placeRole}
          onClick={() => handleCreate(false)}
        >
          Save draft
        </Button>
        <Button
          variant="contained"
          disabled={pending || !locationId || !targetUserId || !placeRole}
          onClick={() => handleCreate(true)}
          sx={primaryButtonSx}
        >
          Submit
        </Button>
      </DialogActions>
    </Dialog>
  );
}
