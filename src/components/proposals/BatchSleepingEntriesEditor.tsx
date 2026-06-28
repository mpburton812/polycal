"use client";

import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import {
  Box,
  Button,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";

import {
  listSleepingLocationOptionsAction,
  type ProposalPlaceOption,
} from "@/actions/proposals";
import type { PersonSummary } from "@/actions/users";
import {
  newBatchEntryId,
  type BatchSleepingEntry,
} from "@/lib/proposals/batch-sleeping-client";

import { ProposalScheduleField } from "./ProposalScheduleFields";
import { POLY_GREEN, POLY_GREEN_HOVER } from "./proposalCardTheme";

type InviteeSelection = "none" | "required" | "optional";

interface BatchSleepingEntriesEditorProps {
  entries: BatchSleepingEntry[];
  onChange: (entries: BatchSleepingEntry[]) => void;
  partnerPeople: PersonSummary[];
  maxEntries?: number;
}

function inviteeModesFromEntry(entry: BatchSleepingEntry): Record<string, InviteeSelection> {
  const modes: Record<string, InviteeSelection> = {};
  for (const invitee of entry.invitees) {
    modes[invitee.userId] = invitee.role;
  }
  return modes;
}

function entryInviteesFromModes(
  modes: Record<string, InviteeSelection>,
): BatchSleepingEntry["invitees"] {
  return Object.entries(modes)
    .filter(([, role]) => role === "required" || role === "optional")
    .map(([userId, role]) => ({ userId, role: role as "required" | "optional" }));
}

/**
 * Embedded editor for per-night batch sleeping mini-proposals.
 */
export function BatchSleepingEntriesEditor({
  entries,
  onChange,
  partnerPeople,
  maxEntries = 14,
}: BatchSleepingEntriesEditorProps) {
  const [locationOptionsByEntry, setLocationOptionsByEntry] = useState<
    Record<string, ProposalPlaceOption[]>
  >({});

  useEffect(() => {
    let cancelled = false;
    async function loadOptions() {
      const next: Record<string, ProposalPlaceOption[]> = {};
      await Promise.all(
        entries.map(async (entry) => {
          const inviteeIds = entry.intentionalSolo
            ? []
            : entry.invitees.map((invitee) => invitee.userId);
          const options = await listSleepingLocationOptionsAction(inviteeIds);
          next[entry.id] = options;
        }),
      );
      if (!cancelled) setLocationOptionsByEntry(next);
    }
    void loadOptions();
    return () => {
      cancelled = true;
    };
  }, [entries]);

  function updateEntry(index: number, patch: Partial<BatchSleepingEntry>) {
    const next = [...entries];
    next[index] = { ...next[index], ...patch };
    onChange(next);
  }

  function cycleInvitee(index: number, personId: string) {
    const entry = entries[index];
    if (!entry || entry.intentionalSolo) return;
    const modes = inviteeModesFromEntry(entry);
    const state = modes[personId] ?? "none";
    const nextRole: InviteeSelection =
      state === "none" ? "required" : state === "required" ? "optional" : "none";
    const nextModes = { ...modes, [personId]: nextRole };
    updateEntry(index, { invitees: entryInviteesFromModes(nextModes) });
  }

  function addEntry() {
    if (entries.length >= maxEntries) return;
    onChange([
      ...entries,
      { id: newBatchEntryId(), nightDate: "", invitees: [], intentionalSolo: false },
    ]);
  }

  function removeEntry(index: number) {
    if (entries.length <= 1) return;
    onChange(entries.filter((_, entryIndex) => entryIndex !== index));
  }

  return (
    <Stack spacing={1.5}>
      {entries.map((entry, index) => {
        const locationOptions = locationOptionsByEntry[entry.id] ?? [];
        const selectedPlace = locationOptions.find((place) => place.id === entry.locationId);
        const bedroomOptions =
          selectedPlace && selectedPlace.bedroomCount > 0
            ? Array.from({ length: selectedPlace.bedroomCount }, (_, bedroomIndex) => ({
                index: bedroomIndex,
                label: selectedPlace.bedroomNames[bedroomIndex] ?? `Bedroom ${bedroomIndex + 1}`,
              }))
            : [];

        return (
          <Box
            key={entry.id}
            sx={{
              p: 1.5,
              border: 1,
              borderColor: "divider",
              borderRadius: 1,
              borderLeft: `3px solid ${POLY_GREEN}`,
            }}
          >
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                Night {index + 1}
              </Typography>
              {entries.length > 1 && (
                <IconButton
                  size="small"
                  aria-label={`Remove night ${index + 1}`}
                  onClick={() => removeEntry(index)}
                >
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              )}
            </Stack>

            <ProposalScheduleField
              label="Night of"
              mode="date"
              value={entry.nightDate.slice(0, 10)}
              onChange={(next) => updateEntry(index, { nightDate: next })}
            />

            <ToggleButtonGroup
              exclusive
              value={entry.intentionalSolo ? "solo" : "network"}
              onChange={(_, value) => {
                if (!value) return;
                const solo = value === "solo";
                updateEntry(index, {
                  intentionalSolo: solo,
                  invitees: solo ? [] : entry.invitees,
                });
              }}
              size="small"
              sx={{
                mt: 1.5,
                mb: 1,
                "& .MuiToggleButton-root.Mui-selected": {
                  bgcolor: POLY_GREEN,
                  color: "#fff",
                  "&:hover": { bgcolor: POLY_GREEN_HOVER },
                },
              }}
            >
              <ToggleButton value="solo">Solo</ToggleButton>
              <ToggleButton value="network">With invitees</ToggleButton>
            </ToggleButtonGroup>

            {!entry.intentionalSolo && (
              <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mb: 1.5 }}>
                {partnerPeople.map((person) => {
                  const mode = inviteeModesFromEntry(entry)[person.id] ?? "none";
                  return (
                    <ToggleButton
                      key={person.id}
                      value={person.id}
                      selected={mode !== "none"}
                      onClick={() => cycleInvitee(index, person.id)}
                      size="small"
                      sx={{
                        textTransform: "none",
                        ...(mode === "required" && {
                          bgcolor: POLY_GREEN,
                          color: "#fff",
                          "&:hover": { bgcolor: POLY_GREEN_HOVER },
                          "&.Mui-selected": { bgcolor: POLY_GREEN, color: "#fff" },
                        }),
                        ...(mode === "optional" && {
                          borderColor: POLY_GREEN,
                          color: POLY_GREEN,
                        }),
                      }}
                    >
                      {person.displayName}
                      {mode !== "none" ? ` (${mode})` : ""}
                    </ToggleButton>
                  );
                })}
              </Stack>
            )}

            <FormControl fullWidth size="small" sx={{ mb: 1 }}>
              <InputLabel id={`batch-location-${entry.id}`}>Location (optional)</InputLabel>
              <Select
                labelId={`batch-location-${entry.id}`}
                label="Location (optional)"
                value={entry.locationId ?? ""}
                onChange={(event) => {
                  const value = event.target.value;
                  updateEntry(index, {
                    locationId: value || undefined,
                    locationText: value ? undefined : entry.locationText,
                    bedroomIndex: value ? entry.bedroomIndex : undefined,
                  });
                }}
              >
                <MenuItem value="">None</MenuItem>
                {locationOptions.map((place) => (
                  <MenuItem key={place.id} value={place.id}>
                    {place.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              label="Custom location (optional)"
              value={entry.locationText ?? ""}
              onChange={(event) =>
                updateEntry(index, {
                  locationText: event.target.value || undefined,
                  locationId: event.target.value ? undefined : entry.locationId,
                })
              }
              fullWidth
              size="small"
              placeholder="Type a location not in the list"
              sx={{ mb: bedroomOptions.length > 0 ? 1 : 0 }}
            />

            {bedroomOptions.length > 0 && (
              <FormControl fullWidth size="small">
                <InputLabel id={`batch-bedroom-${entry.id}`}>Bedroom</InputLabel>
                <Select
                  labelId={`batch-bedroom-${entry.id}`}
                  label="Bedroom"
                  value={
                    entry.bedroomIndex !== null && entry.bedroomIndex !== undefined
                      ? String(entry.bedroomIndex)
                      : ""
                  }
                  onChange={(event) => {
                    const value = event.target.value;
                    updateEntry(index, {
                      bedroomIndex: value === "" ? undefined : Number(value),
                    });
                  }}
                >
                  <MenuItem value="">Any / whole place</MenuItem>
                  {bedroomOptions.map((bedroom) => (
                    <MenuItem key={bedroom.index} value={String(bedroom.index)}>
                      {bedroom.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
          </Box>
        );
      })}

      {entries.length < maxEntries && (
        <Button
          size="small"
          variant="outlined"
          startIcon={<AddIcon />}
          sx={{ borderColor: POLY_GREEN, color: POLY_GREEN, alignSelf: "flex-start" }}
          onClick={addEntry}
        >
          Add night
        </Button>
      )}
    </Stack>
  );
}
