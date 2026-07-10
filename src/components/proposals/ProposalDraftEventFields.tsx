"use client";

import AccessTimeIcon from "@mui/icons-material/AccessTime";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import LocationOnOutlinedIcon from "@mui/icons-material/LocationOnOutlined";
import {
  Box,
  Button,
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

import { ProposalDraftSectionHeader } from "./ProposalDraftSectionHeader";
import { ProposalScheduleField } from "./ProposalScheduleFields";
import { POLY_GREEN, POLY_GREEN_HOVER } from "./proposalCardTheme";
import type { InviteeSelection, SlotDraft } from "./proposalDraftDateUtils";

export interface ProposalDraftEventFieldsProps {
  title: string;
  onTitleChange: (value: string) => void;
  allDay: boolean;
  onAllDayChange: (nextAllDay: boolean) => void;
  slots: SlotDraft[];
  onSlotsChange: (slots: SlotDraft[]) => void;
  isPoll: boolean;
  applyEventStartChange: (index: number, nextStart: string) => void;
  isSoloProposal: boolean;
  soloEvent: boolean;
  onSoloEventChange: (solo: boolean) => void;
  candidates: PersonSummary[];
  inviteeMode: Record<string, InviteeSelection>;
  setInviteeRole: (personId: string, role: InviteeSelection) => void;
  locationId: string;
  locationCustom: string;
  locationOptions: ProposalPlaceOption[];
  onLocationIdChange: (value: string) => void;
  onLocationCustomChange: (value: string) => void;
  onClearBedroom: () => void;
}

/**
 * Event happy-path fields: title, when, invitees, location (PC-132).
 */
export function ProposalDraftEventFields({
  title,
  onTitleChange,
  allDay,
  onAllDayChange,
  slots,
  onSlotsChange,
  isPoll,
  applyEventStartChange,
  isSoloProposal,
  soloEvent,
  onSoloEventChange,
  candidates,
  inviteeMode,
  setInviteeRole,
  locationId,
  locationCustom,
  locationOptions,
  onLocationIdChange,
  onLocationCustomChange,
  onClearBedroom,
}: ProposalDraftEventFieldsProps) {
  return (
    <Stack spacing={2} sx={{ mb: 2 }}>
      <TextField
        label="Title"
        value={title}
        onChange={(event) => onTitleChange(event.target.value)}
        required
        fullWidth
        size="small"
        placeholder="Untitled Proposal"
      />

      <ProposalDraftSectionHeader
        icon={<AccessTimeIcon fontSize="small" />}
        title="When"
        subtitle="Date and digital time — end defaults to one hour after start"
      />
      <FormControlLabel
        control={
          <Checkbox
            checked={allDay}
            onChange={(event) => {
              const nextAllDay = event.target.checked;
              onAllDayChange(nextAllDay);
              onSlotsChange(
                slots.map((slot) => ({
                  ...slot,
                  startAt: slot.startAt
                    ? nextAllDay
                      ? slot.startAt.slice(0, 10)
                      : `${slot.startAt.slice(0, 10)}T09:00`
                    : "",
                  endAt: slot.endAt
                    ? nextAllDay
                      ? slot.endAt.slice(0, 10)
                      : `${slot.endAt.slice(0, 10)}T10:00`
                    : "",
                })),
              );
            }}
            sx={{ color: POLY_GREEN, "&.Mui-checked": { color: POLY_GREEN } }}
          />
        }
        label="All-day event (dates only, no clock times)"
      />
      {slots.map((slot, index) => (
        <Box
          key={`slot-${index}`}
          sx={{
            p: 1.5,
            border: 1,
            borderColor: "divider",
            borderRadius: 1,
            borderLeft: `3px solid ${POLY_GREEN}`,
          }}
        >
          {isPoll && (
            <TextField
              label={`Option ${index + 1} label`}
              value={slot.label}
              onChange={(event) => {
                const next = [...slots];
                next[index] = { ...next[index], label: event.target.value };
                onSlotsChange(next);
              }}
              fullWidth
              size="small"
              sx={{ mb: 1 }}
            />
          )}
          <Stack spacing={1}>
            <ProposalScheduleField
              label={allDay ? "Day" : "Start"}
              mode={allDay ? "date" : "datetime"}
              value={slot.startAt}
              onChange={(next) => applyEventStartChange(index, next)}
              helperText={!allDay ? "Digital time — end defaults to start + 1 hour" : undefined}
            />
            <ProposalScheduleField
              label={allDay ? "End day (optional)" : "End (optional)"}
              mode={allDay ? "date" : "datetime"}
              value={slot.endAt}
              disabled={!slot.startAt}
              onChange={(next) => {
                const updated = [...slots];
                updated[index] = { ...updated[index], endAt: next };
                onSlotsChange(updated);
              }}
            />
          </Stack>
        </Box>
      ))}
      {isPoll && slots.length < 5 && (
        <Button
          size="small"
          variant="outlined"
          sx={{ borderColor: POLY_GREEN, color: POLY_GREEN }}
          onClick={() => onSlotsChange([...slots, { startAt: "", endAt: "", label: "" }])}
        >
          Add poll option
        </Button>
      )}

      <ProposalDraftSectionHeader
        icon={<GroupsOutlinedIcon fontSize="small" />}
        title="Invitees"
        subtitle={
          isSoloProposal
            ? "Solo proposals do not include invitees"
            : "Choose Required or Optional for each person"
        }
      />
      <ToggleButtonGroup
        exclusive
        value={soloEvent ? "solo" : "group"}
        onChange={(_, value) => {
          if (!value) return;
          onSoloEventChange(value === "solo");
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
        <ToggleButton value="group">With invitees</ToggleButton>
        <ToggleButton value="solo">Solo event (just me)</ToggleButton>
      </ToggleButtonGroup>
      {!isSoloProposal && (
        <Stack spacing={1}>
          {candidates.map((person) => {
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
                  <ToggleButton value="required" aria-label={`${person.displayName} required`}>
                    Required
                  </ToggleButton>
                  <ToggleButton value="optional" aria-label={`${person.displayName} optional`}>
                    Optional
                  </ToggleButton>
                </ToggleButtonGroup>
              </Stack>
            );
          })}
        </Stack>
      )}

      <ProposalDraftSectionHeader
        icon={<LocationOnOutlinedIcon fontSize="small" />}
        title="Location"
        subtitle="Optional place or custom text"
      />
      <FormControl fullWidth size="small">
        <InputLabel id="proposal-location-label">Location (optional)</InputLabel>
        <Select
          labelId="proposal-location-label"
          label="Location (optional)"
          value={locationId}
          onChange={(event) => {
            const value = event.target.value;
            onLocationIdChange(value);
            if (value) onLocationCustomChange("");
            if (!value) onClearBedroom();
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
            onClearBedroom();
          }
        }}
        fullWidth
        size="small"
        placeholder="Type a location not in the list"
      />
    </Stack>
  );
}
