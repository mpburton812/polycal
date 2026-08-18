"use client";

import AccessTimeIcon from "@mui/icons-material/AccessTime";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import LocationOnOutlinedIcon from "@mui/icons-material/LocationOnOutlined";
import {
  Box,
  Button,
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

import type { ProposalPlaceOption } from "@/actions/proposals";
import type { PersonSummary } from "@/actions/users";
import { OrganicAvatar } from "@/components/ui/OrganicAvatar";
import { avatarSrcForKey } from "@/lib/constants/avatars";
import { LONG_TEXT_MAX, SHORT_TEXT_MAX } from "@/lib/validation/string-limits";

import { ProposalDraftSectionHeader } from "./ProposalDraftSectionHeader";
import { ProposalDateRangeField } from "./ProposalDateRangeField";
import { ProposalScheduleField } from "./ProposalScheduleFields";
import { POLY_GREEN, POLY_GREEN_HOVER } from "./proposalCardTheme";
import type { InviteeSelection, SlotDraft } from "./proposalDraftDateUtils";

export interface ProposalDraftEventFieldsProps {
  title: string;
  onTitleChange: (value: string) => void;
  allDay: boolean;
  slots: SlotDraft[];
  onSlotsChange: (slots: SlotDraft[]) => void;
  isPoll: boolean;
  applyEventStartChange: (index: number, nextStart: string) => void;
  isSoloProposal: boolean;
  /** When false, hide When date fields until a schedule type is chosen (PC-421). */
  showWhenFields?: boolean;
  /** When false, hide invitee controls until schedule type is chosen (PC-429). */
  showInvitees?: boolean;
  /** When false, hide location until invitees are chosen (PC-429). */
  showLocation?: boolean;
  /** Title is shown on the parent card (PC-429). */
  hideTitle?: boolean;
  inviteeChoice: "unset" | "group" | "solo";
  onInviteeChoiceChange: (choice: "unset" | "group" | "solo") => void;
  /** Schedule posting: people are attendees, no Required/Optional (PC-424). */
  hideInviteeRoles?: boolean;
  candidates: PersonSummary[];
  inviteeMode: Record<string, InviteeSelection>;
  setInviteeRole: (personId: string, role: InviteeSelection) => void;
  locationId: string;
  locationCustom: string;
  locationOptions: ProposalPlaceOption[];
  onLocationIdChange: (value: string) => void;
  onLocationCustomChange: (value: string) => void;
  onClearBedroom: () => void;
  /** When true, show recurrence pattern/count under the date fields (PC-171). */
  isRecurring?: boolean;
  recurrencePattern?: "daily" | "weekly" | "monthly" | "yearly";
  onRecurrencePatternChange?: (value: "daily" | "weekly" | "monthly" | "yearly") => void;
  recurrenceCount?: number;
  onRecurrenceCountChange?: (value: number) => void;
}

/**
 * Event happy-path fields: title, when, invitees, location (PC-132).
 */
export function ProposalDraftEventFields({
  title,
  onTitleChange,
  allDay,
  slots,
  onSlotsChange,
  isPoll,
  applyEventStartChange,
  isSoloProposal,
  inviteeChoice,
  onInviteeChoiceChange,
  hideInviteeRoles = false,
  showWhenFields = true,
  showInvitees = true,
  showLocation = true,
  hideTitle = false,
  candidates,
  inviteeMode,
  setInviteeRole,
  locationId,
  locationCustom,
  locationOptions,
  onLocationIdChange,
  onLocationCustomChange,
  onClearBedroom,
  isRecurring = false,
  recurrencePattern = "weekly",
  onRecurrencePatternChange,
  recurrenceCount = 4,
  onRecurrenceCountChange,
}: ProposalDraftEventFieldsProps) {
  return (
    <Stack spacing={2} sx={{ mb: 2 }}>
      {!hideTitle ? (
      <TextField
        label="Title"
        value={title}
        onChange={(event) => onTitleChange(event.target.value)}
        required
        fullWidth
        size="small"
        placeholder="Untitled Proposal"
        inputProps={{ maxLength: LONG_TEXT_MAX }}
      />
      ) : null}

      {showWhenFields ? (
        <>
      <ProposalDraftSectionHeader
        icon={<AccessTimeIcon fontSize="small" />}
        title="When"
        subtitle={
          allDay
            ? "Click two days on the calendar for start and end"
            : "Date and digital time — end defaults to one hour after start"
        }
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
              inputProps={{ maxLength: LONG_TEXT_MAX }}
              sx={{ mb: 1 }}
            />
          )}
          {allDay ? (
            <ProposalDateRangeField
              startLabel="Day"
              endLabel="End day"
              startValue={slot.startAt}
              endValue={slot.endAt}
              onRangeChange={(start, end) => {
                const updated = [...slots];
                updated[index] = { ...updated[index], startAt: start, endAt: end };
                onSlotsChange(updated);
              }}
              helperText="Earliest day is start; latest is end"
            />
          ) : (
            <Stack spacing={1}>
              <ProposalScheduleField
                label="Start"
                mode="datetime"
                value={slot.startAt}
                onChange={(next) => applyEventStartChange(index, next)}
                helperText="Digital time — end defaults to start + 1 hour"
              />
              <ProposalScheduleField
                label="End (optional)"
                mode="datetime"
                value={slot.endAt}
                disabled={!slot.startAt}
                onChange={(next) => {
                  const updated = [...slots];
                  updated[index] = { ...updated[index], endAt: next };
                  onSlotsChange(updated);
                }}
              />
            </Stack>
          )}
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

      {isRecurring && onRecurrencePatternChange && onRecurrenceCountChange ? (
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
          <FormControl fullWidth size="small">
            <InputLabel id="recurrence-pattern-label">Pattern</InputLabel>
            <Select
              labelId="recurrence-pattern-label"
              label="Pattern"
              value={recurrencePattern}
              onChange={(event) =>
                onRecurrencePatternChange(
                  event.target.value as "daily" | "weekly" | "monthly" | "yearly",
                )
              }
            >
              <MenuItem value="daily">Daily</MenuItem>
              <MenuItem value="weekly">Weekly</MenuItem>
              <MenuItem value="monthly">Monthly</MenuItem>
              <MenuItem value="yearly">Yearly</MenuItem>
            </Select>
          </FormControl>
          <TextField
            label="Occurrences"
            type="number"
            size="small"
            value={recurrenceCount}
            onChange={(event) =>
              onRecurrenceCountChange(Math.min(52, Math.max(2, Number(event.target.value) || 2)))
            }
            inputProps={{ min: 2, max: 52 }}
            sx={{ width: { xs: "100%", sm: 140 } }}
          />
        </Stack>
      ) : null}
        </>
      ) : null}

      {showInvitees ? (
      <>
      <ProposalDraftSectionHeader
        icon={<GroupsOutlinedIcon fontSize="small" />}
        title="Invitees"
        subtitle={
          hideInviteeRoles
            ? "Add people who will be on this calendar item — no approvals"
            : isSoloProposal
            ? "Solo proposals do not include invitees"
            : "Choose Required or Optional for each person"
        }
      />
      <ToggleButtonGroup
        exclusive
        value={inviteeChoice === "unset" ? null : inviteeChoice}
        onChange={(_, value) => {
          if (!value) {
            onInviteeChoiceChange("unset");
            return;
          }
          onInviteeChoiceChange(value as "group" | "solo");
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
        <ToggleButton value="solo">Solo (just me)</ToggleButton>
        <ToggleButton value="group">With Others</ToggleButton>
      </ToggleButtonGroup>
      {!isSoloProposal && inviteeChoice === "group" && (
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
                <Stack alignItems="center" spacing={0.5} sx={{ minWidth: 72 }}>
                  <OrganicAvatar
                    src={avatarSrcForKey(person.avatarKey)}
                    alt=""
                    label={person.displayName}
                    size={36}
                  />
                  <Typography variant="caption" sx={{ textAlign: "center" }}>
                    {person.displayName}
                  </Typography>
                </Stack>
                {hideInviteeRoles ? (
                  <ToggleButton
                    value="optional"
                    selected={mode !== "none"}
                    aria-label={`${person.displayName} include`}
                    onClick={() =>
                      setInviteeRole(person.id, mode === "none" ? "optional" : "none")
                    }
                    size="small"
                    sx={{
                      "&.Mui-selected": {
                        bgcolor: POLY_GREEN,
                        color: "#fff",
                        "&:hover": { bgcolor: POLY_GREEN_HOVER },
                      },
                    }}
                  >
                    Include
                  </ToggleButton>
                ) : (
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
                )}
              </Stack>
            );
          })}
        </Stack>
      )}
      </>
      ) : null}

      {showLocation ? (
      <>
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
        inputProps={{ maxLength: SHORT_TEXT_MAX }}
      />
      </>
      ) : null}
    </Stack>
  );
}
