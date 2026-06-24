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
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { createDraftProposalAction } from "@/actions/proposals";
import type { ProposalPlaceOption } from "@/actions/proposals";
import type { PersonSummary } from "@/actions/users";

type InviteeSelection = "none" | "required" | "optional";

interface CreateProposalDialogProps {
  open: boolean;
  onClose: () => void;
  people: PersonSummary[];
  places: ProposalPlaceOption[];
  currentUserId: string;
}

/**
 * Draft creation dialog — event/sleeping types with invitee weighting (PC-40).
 */
export function CreateProposalDialog({
  open,
  onClose,
  people,
  places,
  currentUserId,
}: CreateProposalDialogProps) {
  const router = useRouter();
  const [proposalType, setProposalType] = useState<"event" | "sleeping">("event");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [locationId, setLocationId] = useState("");
  const [intentionalSolo, setIntentionalSolo] = useState(false);
  const [inviteeMode, setInviteeMode] = useState<Record<string, InviteeSelection>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const candidates = people.filter(
    (person) => person.id !== currentUserId && person.status === "active",
  );

  function resetForm() {
    setProposalType("event");
    setTitle("");
    setDescription("");
    setNotes("");
    setLocationId("");
    setIntentionalSolo(false);
    setInviteeMode({});
    setError(null);
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  function cycleInvitee(personId: string) {
    setInviteeMode((current) => {
      const state = current[personId] ?? "none";
      const next: InviteeSelection =
        state === "none" ? "required" : state === "required" ? "optional" : "none";
      return { ...current, [personId]: next };
    });
  }

  function handleCreate() {
    setError(null);
    const invitees = Object.entries(inviteeMode)
      .filter(([, role]) => role === "required" || role === "optional")
      .map(([userId, role]) => ({ userId, role: role as "required" | "optional" }));

    startTransition(async () => {
      const result = await createDraftProposalAction({
        title,
        description,
        proposalType,
        locationId: locationId || undefined,
        notes: notes || undefined,
        intentionalSolo: proposalType === "sleeping" ? intentionalSolo : false,
        invitees,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      handleClose();
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
      <DialogTitle>New proposal</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <FormControl fullWidth>
            <InputLabel id="proposal-type-label">Type</InputLabel>
            <Select
              labelId="proposal-type-label"
              label="Type"
              value={proposalType}
              onChange={(event) => setProposalType(event.target.value as "event" | "sleeping")}
            >
              <MenuItem value="event">Event</MenuItem>
              <MenuItem value="sleeping">Sleeping</MenuItem>
            </Select>
          </FormControl>
          <TextField
            label="Title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            fullWidth
          />
          <TextField
            label="Description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            required
            fullWidth
            multiline
            minRows={2}
          />
          <TextField
            label="Notes (optional)"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            fullWidth
            multiline
            minRows={2}
          />
          <FormControl fullWidth>
            <InputLabel id="proposal-place-label">Location (optional)</InputLabel>
            <Select
              labelId="proposal-place-label"
              label="Location (optional)"
              value={locationId}
              onChange={(event) => setLocationId(event.target.value)}
            >
              <MenuItem value="">None</MenuItem>
              {places.map((place) => (
                <MenuItem key={place.id} value={place.id}>
                  {place.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {proposalType === "sleeping" && (
            <ToggleButtonGroup
              exclusive
              value={intentionalSolo ? "solo" : "network"}
              onChange={(_, value) => {
                if (value) setIntentionalSolo(value === "solo");
              }}
              size="small"
            >
              <ToggleButton value="network">With invitees</ToggleButton>
              <ToggleButton value="solo">Intentional solo</ToggleButton>
            </ToggleButtonGroup>
          )}
          <Typography variant="subtitle2">Invitees</Typography>
          <Typography variant="caption" color="text.secondary">
            Tap a person to cycle: none → required → optional → none.
          </Typography>
          <Stack direction="row" flexWrap="wrap" gap={1}>
            {candidates.map((person) => {
              const mode = inviteeMode[person.id] ?? "none";
              return (
                <ToggleButton
                  key={person.id}
                  value={person.id}
                  selected={mode !== "none"}
                  onClick={() => cycleInvitee(person.id)}
                  size="small"
                  color={mode === "required" ? "primary" : "standard"}
                >
                  {person.displayName}
                  {mode !== "none" ? ` (${mode})` : ""}
                </ToggleButton>
              );
            })}
          </Stack>
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!title.trim() || !description.trim() || pending}
          onClick={handleCreate}
        >
          Save draft
        </Button>
      </DialogActions>
    </Dialog>
  );
}
