"use client";

import AccessTimeIcon from "@mui/icons-material/AccessTime";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import LocationOnOutlinedIcon from "@mui/icons-material/LocationOnOutlined";
import {
  Box,
  Checkbox,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";

import type { ProposalPlaceOption } from "@/actions/proposals";
import type { PersonSummary } from "@/actions/users";
import type { BatchSleepingEntry } from "@/lib/proposals/batch-sleeping";
import type { FastSleepingRow } from "@/lib/proposals/fast-sleeping-plan";
import { SHORT_TEXT_MAX } from "@/lib/validation/string-limits";

import { FastSleepingPlanGrid } from "./FastSleepingPlanGrid";
import { ProposalDateRangeField } from "./ProposalDateRangeField";
import { ProposalDraftSectionHeader } from "./ProposalDraftSectionHeader";
import { POLY_GREEN, POLY_GREEN_HOVER, POLY_GREEN_LIGHT } from "./proposalCardTheme";
import type { InviteeSelection, SlotDraft } from "./proposalDraftDateUtils";

export interface ProposalDraftSleepingFieldsProps {
  batchMode: boolean;
  onBatchModeChange: (value: boolean) => void;
  fastPlanRows: FastSleepingRow[];
  onFastPlanRowsChange: (rows: FastSleepingRow[]) => void;
  sleepingCandidates: PersonSummary[];
  batchLocationOptions: ProposalPlaceOption[];
  configuredBatchEntries: BatchSleepingEntry[];
  people: PersonSummary[];
  locationOptions: ProposalPlaceOption[];
  pending: boolean;
  intentionalSolo: boolean;
  onIntentionalSoloChange: (solo: boolean) => void;
  isSoloProposal: boolean;
  candidates: PersonSummary[];
  inviteeMode: Record<string, InviteeSelection>;
  setInviteeRole: (personId: string, role: InviteeSelection) => void;
  slots: SlotDraft[];
  onSlotsChange: (slots: SlotDraft[]) => void;
  locationId: string;
  locationCustom: string;
  bedroomIndex: number | "";
  bedroomOptions: { index: number; label: string }[];
  onLocationIdChange: (value: string) => void;
  onLocationCustomChange: (value: string) => void;
  onBedroomIndexChange: (value: number | "") => void;
}

/**
 * Sleeping happy-path fields: batch grid or who/night/where (PC-132).
 */
export function ProposalDraftSleepingFields({
  batchMode,
  onBatchModeChange,
  fastPlanRows,
  onFastPlanRowsChange,
  sleepingCandidates,
  batchLocationOptions,
  configuredBatchEntries,
  people,
  locationOptions,
  pending,
  intentionalSolo,
  onIntentionalSoloChange,
  isSoloProposal,
  candidates,
  inviteeMode,
  setInviteeRole,
  slots,
  onSlotsChange,
  locationId,
  locationCustom,
  bedroomIndex,
  bedroomOptions,
  onLocationIdChange,
  onLocationCustomChange,
  onBedroomIndexChange,
}: ProposalDraftSleepingFieldsProps) {
  return (
    <Stack spacing={2} sx={{ mb: 2 }}>
      <FormControlLabel
        control={
          <Checkbox
            checked={batchMode}
            onChange={(event) => onBatchModeChange(event.target.checked)}
            sx={{ color: POLY_GREEN, "&.Mui-checked": { color: POLY_GREEN } }}
          />
        }
        label="Batch nights (plan up to 14 nights in one proposal)"
      />

      {batchMode ? (
        <>
          <ProposalDraftSectionHeader
            icon={<AccessTimeIcon fontSize="small" />}
            title="Batch nights"
            subtitle="Empty nights are skipped. Mark partners required or optional."
          />
          <FastSleepingPlanGrid
            rows={fastPlanRows}
            onChange={onFastPlanRowsChange}
            partnerPeople={sleepingCandidates}
            locationOptions={batchLocationOptions}
            disabled={pending}
          />
          {configuredBatchEntries.length > 0 && (
            <Box sx={{ p: 1.5, bgcolor: POLY_GREEN_LIGHT, borderRadius: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                Proposed nights summary ({configuredBatchEntries.length})
              </Typography>
              <Stack spacing={0.75}>
                {configuredBatchEntries.map((entry, index) => {
                  const place =
                    locationOptions.find((p) => p.id === entry.locationId)?.name ??
                    entry.locationText ??
                    "No location";
                  const inviteeLabels = entry.intentionalSolo
                    ? ["Solo"]
                    : entry.invitees.map((invitee) => {
                        const person = people.find((p) => p.id === invitee.userId);
                        return person ? person.displayName : invitee.userId;
                      });
                  return (
                    <Typography key={entry.id} variant="body2" sx={{ color: POLY_GREEN }}>
                      Night {index + 1}: {entry.nightDate.slice(0, 10)} · {place}
                      {inviteeLabels.length > 0 ? ` · ${inviteeLabels.join(", ")}` : ""}
                    </Typography>
                  );
                })}
              </Stack>
            </Box>
          )}
        </>
      ) : (
        <>
          <ProposalDraftSectionHeader
            icon={<GroupsOutlinedIcon fontSize="small" />}
            title="Who"
            subtitle="Accepted sleeping partners only — Solo or With"
          />
          <ToggleButtonGroup
            exclusive
            value={intentionalSolo ? "solo" : "network"}
            onChange={(_, value) => {
              if (!value) return;
              onIntentionalSoloChange(value === "solo");
            }}
            size="small"
            sx={{
              mb: 1,
              "& .MuiToggleButton-root.Mui-selected": {
                bgcolor: POLY_GREEN,
                color: "#fff",
                "&:hover": { bgcolor: POLY_GREEN_HOVER },
              },
            }}
          >
            <ToggleButton value="solo">Solo</ToggleButton>
            <ToggleButton value="network">With partners</ToggleButton>
          </ToggleButtonGroup>
          {!isSoloProposal && (
            <Stack spacing={1}>
              {candidates.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No accepted sleeping partners yet. Propose a partnership from People &amp;
                  Places, or choose Solo.
                </Typography>
              ) : (
                candidates.map((person) => {
                  const mode = inviteeMode[person.id] ?? "none";
                  return (
                    <Stack
                      key={person.id}
                      direction="row"
                      spacing={1}
                      alignItems="center"
                      justifyContent="space-between"
                      flexWrap="wrap"
                    >
                      <Typography variant="body2" sx={{ minWidth: 96 }}>
                        {person.displayName}
                      </Typography>
                      <ToggleButtonGroup
                        exclusive
                        size="small"
                        value={mode === "none" ? null : mode}
                        onChange={(_, value) => {
                          setInviteeRole(person.id, (value as InviteeSelection | null) ?? "none");
                        }}
                        sx={{
                          "& .MuiToggleButton-root.Mui-selected": {
                            bgcolor: POLY_GREEN,
                            color: "#fff",
                            "&:hover": { bgcolor: POLY_GREEN_HOVER },
                          },
                        }}
                      >
                        <ToggleButton
                          value="required"
                          aria-label={`${person.displayName} required`}
                        >
                          Required
                        </ToggleButton>
                        <ToggleButton
                          value="optional"
                          aria-label={`${person.displayName} optional`}
                        >
                          Optional
                        </ToggleButton>
                      </ToggleButtonGroup>
                    </Stack>
                  );
                })
              )}
            </Stack>
          )}

          <ProposalDraftSectionHeader
            icon={<AccessTimeIcon fontSize="small" />}
            title="Night"
            subtitle="Click two days for a night range — earliest is start, latest is end"
          />
          {slots.map((slot, index) => (
            <ProposalDateRangeField
              key={`sleep-slot-${index}`}
              startLabel="Night of"
              endLabel="Last night"
              startValue={slot.startAt}
              endValue={slot.endAt}
              onRangeChange={(start, end) => {
                const updated = [...slots];
                updated[index] = {
                  ...updated[index],
                  startAt: start,
                  endAt: end || start,
                };
                onSlotsChange(updated);
              }}
              helperText="Leave as a single day for one night"
            />
          ))}

          <ProposalDraftSectionHeader
            icon={<LocationOnOutlinedIcon fontSize="small" />}
            title="Where"
            subtitle="Place, custom text, and optional bedroom"
          />
          <FormControl fullWidth size="small">
            <InputLabel id="sleeping-location-label">Location (optional)</InputLabel>
            <Select
              labelId="sleeping-location-label"
              label="Location (optional)"
              value={locationId}
              onChange={(event) => {
                const value = event.target.value;
                onLocationIdChange(value);
                if (value) onLocationCustomChange("");
                if (!value) onBedroomIndexChange("");
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
            value={locationCustom}
            onChange={(event) => {
              onLocationCustomChange(event.target.value);
              if (event.target.value) {
                onLocationIdChange("");
                onBedroomIndexChange("");
              }
            }}
            fullWidth
            size="small"
            placeholder="Type a location not in the list"
            inputProps={{ maxLength: SHORT_TEXT_MAX }}
          />
          {bedroomOptions.length > 0 && (
            <FormControl fullWidth size="small">
              <InputLabel id="proposal-bedroom-label">Bedroom</InputLabel>
              <Select
                labelId="proposal-bedroom-label"
                label="Bedroom"
                value={bedroomIndex === "" ? "" : String(bedroomIndex)}
                onChange={(event) => {
                  const value = event.target.value;
                  onBedroomIndexChange(value === "" ? "" : Number(value));
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
        </>
      )}
    </Stack>
  );
}
