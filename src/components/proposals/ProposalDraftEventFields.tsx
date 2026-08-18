"use client";

import AccessTimeIcon from "@mui/icons-material/AccessTime";
import {
  Box,
  Button,
  Slider,
  Stack,
  TextField,
  Typography,
} from "@mui/material";

import type { ProposalPlaceOption } from "@/actions/proposals";
import type { PersonSummary } from "@/actions/users";
import { LONG_TEXT_MAX } from "@/lib/validation/string-limits";
import { inviteeIsSelected } from "@/lib/proposals/invitee-tap-cycle";
import { isStrictIsoDate } from "./proposalDateRangeUtils";

import { ProposalDraftSectionHeader } from "./ProposalDraftSectionHeader";
import { ProposalDateRangeField } from "./ProposalDateRangeField";
import { ProposalDraftWhereButtons } from "./ProposalDraftWhereButtons";
import { ProposalDraftWhoRow } from "./ProposalDraftWhoRow";
import { ProposalScheduleField } from "./ProposalScheduleFields";
import { POLY_GREEN } from "./proposalCardTheme";
import type { InviteeSelection, SlotDraft } from "./proposalDraftDateUtils";

export interface ProposalDraftEventFieldsProps {
  title: string;
  onTitleChange: (value: string) => void;
  allDay: boolean;
  onAllDayChange: (value: boolean) => void;
  slots: SlotDraft[];
  onSlotsChange: (slots: SlotDraft[]) => void;
  isPoll: boolean;
  applyEventStartChange: (index: number, nextStart: string) => void;
  showWhenFields?: boolean;
  showInvitees?: boolean;
  showLocation?: boolean;
  hideTitle?: boolean;
  postingKind: "proposal" | "booking";
  candidates: PersonSummary[];
  people: PersonSummary[];
  viewerId: string;
  onBehalfOfUserId?: string;
  inviteeMode: Record<string, InviteeSelection>;
  setInviteeRole: (personId: string, role: InviteeSelection) => void;
  locationId: string;
  locationCustom: string;
  locationOptions: ProposalPlaceOption[];
  onLocationIdChange: (value: string) => void;
  onLocationCustomChange: (value: string) => void;
  onClearBedroom: () => void;
}

function datePart(value: string): string {
  return value.slice(0, 10);
}

function timePart(value: string, fallback: string): string {
  if (value.includes("T") && value.length >= 16) return value.slice(11, 16);
  return fallback;
}

function combine(date: string, time: string): string {
  if (!date) return "";
  return `${date}T${time}`;
}

function minutesFromHhmm(value: string): number {
  const [h, m] = value.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

function hhmmFromMinutes(total: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 45, total));
  const hours = Math.floor(clamped / 60);
  const minutes = clamped % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/**
 * Event fields: calendar + optional times, Who chips, Where homes (PC-433–436).
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
  showWhenFields = true,
  showInvitees = true,
  showLocation = true,
  hideTitle = false,
  postingKind,
  candidates,
  people,
  viewerId,
  onBehalfOfUserId,
  inviteeMode,
  setInviteeRole,
  locationId,
  locationCustom,
  locationOptions,
  onLocationIdChange,
  onLocationCustomChange,
  onClearBedroom,
}: ProposalDraftEventFieldsProps) {
  const slot = slots[0] ?? { startAt: "", endAt: "", label: "" };
  const startDate = datePart(slot.startAt);
  const endDate = datePart(slot.endAt);
  const startTime = timePart(slot.startAt, "19:00");
  const endTime = timePart(slot.endAt, "21:00");
  const selectedIds = Object.entries(inviteeMode)
    .filter(([, role]) => inviteeIsSelected(role))
    .map(([id]) => id);

  function setDateRange(start: string, end: string) {
    if (allDay || isPoll) {
      const updated = [...slots];
      updated[0] = { ...updated[0], startAt: start, endAt: end };
      onSlotsChange(updated);
      return;
    }
    const dayEnd = isStrictIsoDate(end) ? end : start;
    const updated = [...slots];
    updated[0] = {
      ...updated[0],
      startAt: combine(start, startTime),
      endAt: combine(dayEnd, endTime),
    };
    onSlotsChange(updated);
  }

  function toggleTimes() {
    if (allDay) {
      onAllDayChange(false);
      const start = startDate || slot.startAt.slice(0, 10);
      const end = endDate || start;
      if (start) {
        const updated = [...slots];
        updated[0] = {
          ...updated[0],
          startAt: combine(start, "19:00"),
          endAt: combine(end, "21:00"),
        };
        onSlotsChange(updated);
      }
      return;
    }
    onAllDayChange(true);
    const updated = slots.map((item) => ({
      ...item,
      startAt: datePart(item.startAt),
      endAt: datePart(item.endAt || item.startAt),
    }));
    onSlotsChange(updated);
  }

  function applySlider(range: number[]) {
    const nextStart = hhmmFromMinutes(range[0] ?? 0);
    const nextEnd = hhmmFromMinutes(range[1] ?? 60);
    const start = startDate || datePart(slot.startAt);
    const end = endDate || start;
    if (!start) return;
    const updated = [...slots];
    updated[0] = {
      ...updated[0],
      startAt: combine(start, nextStart),
      endAt: combine(end, nextEnd),
    };
    onSlotsChange(updated);
  }

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

      {showWhenFields && isPoll ? (
        <>
          <ProposalDraftSectionHeader
            icon={<AccessTimeIcon fontSize="small" />}
            title="When"
            subtitle="Poll options — labeled date and time slots"
          />
          {slots.map((item, index) => (
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
              <TextField
                label={`Option ${index + 1} label`}
                value={item.label}
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
              <Stack spacing={1}>
                <ProposalScheduleField
                  label="Start"
                  mode="datetime"
                  value={item.startAt}
                  onChange={(next) => applyEventStartChange(index, next)}
                  helperText="Digital time — end defaults to start + 1 hour"
                />
                <ProposalScheduleField
                  label="End (optional)"
                  mode="datetime"
                  value={item.endAt}
                  disabled={!item.startAt}
                  onChange={(next) => {
                    const updated = [...slots];
                    updated[index] = { ...updated[index], endAt: next };
                    onSlotsChange(updated);
                  }}
                />
              </Stack>
            </Box>
          ))}
          {slots.length < 5 && (
            <Button
              size="small"
              variant="outlined"
              sx={{ borderColor: POLY_GREEN, color: POLY_GREEN }}
              onClick={() => onSlotsChange([...slots, { startAt: "", endAt: "", label: "" }])}
            >
              Add poll option
            </Button>
          )}
        </>
      ) : null}

      {showWhenFields && !isPoll ? (
        <>
          <ProposalDraftSectionHeader
            icon={<AccessTimeIcon fontSize="small" />}
            title="When"
            subtitle={
              allDay
                ? "Tap a day or drag a range — defaults to all day"
                : "Dates plus start and stop times"
            }
          />
          <ProposalDateRangeField
            startLabel="Day"
            endLabel="End day"
            startValue={startDate}
            endValue={endDate}
            onRangeChange={setDateRange}
            helperText="Earliest day is start; latest is end"
          />
          <Button
            size="small"
            variant={allDay ? "outlined" : "contained"}
            onClick={toggleTimes}
            sx={{
              alignSelf: "flex-start",
              borderColor: POLY_GREEN,
              color: allDay ? POLY_GREEN : "#fff",
              bgcolor: allDay ? "transparent" : POLY_GREEN,
            }}
            aria-pressed={!allDay}
          >
            {allDay ? "Add times" : "All day"}
          </Button>
          {!allDay ? (
            <Stack spacing={1}>
              <Typography variant="caption" color="text.secondary">
                Start / stop
              </Typography>
              <Slider
                value={[minutesFromHhmm(startTime), minutesFromHhmm(endTime)]}
                onChange={(_, value) => {
                  if (!Array.isArray(value)) return;
                  applySlider(value);
                }}
                min={0}
                max={23 * 60 + 45}
                step={15}
                valueLabelDisplay="auto"
                valueLabelFormat={(value) => hhmmFromMinutes(value)}
                sx={{ color: POLY_GREEN, mx: 1 }}
              />
              <ProposalScheduleField
                label="Start"
                mode="datetime"
                value={slot.startAt.includes("T") ? slot.startAt : combine(startDate, startTime)}
                onChange={(next) => applyEventStartChange(0, next)}
                helperText="Digital time — end defaults to start + 1 hour"
              />
              <ProposalScheduleField
                label="End (optional)"
                mode="datetime"
                value={slot.endAt.includes("T") ? slot.endAt : combine(endDate, endTime)}
                disabled={!slot.startAt}
                onChange={(next) => {
                  const updated = [...slots];
                  updated[0] = { ...updated[0], endAt: next };
                  onSlotsChange(updated);
                }}
              />
            </Stack>
          ) : null}
        </>
      ) : null}

      {showInvitees ? (
        <ProposalDraftWhoRow
          candidates={candidates}
          inviteeMode={inviteeMode}
          setInviteeRole={setInviteeRole}
          postingKind={postingKind}
        />
      ) : null}

      {showLocation ? (
        <ProposalDraftWhereButtons
          places={locationOptions}
          people={people}
          viewerId={viewerId}
          selectedUserIds={selectedIds}
          onBehalfOfUserId={onBehalfOfUserId}
          locationId={locationId}
          locationCustom={locationCustom}
          onLocationIdChange={onLocationIdChange}
          onLocationCustomChange={onLocationCustomChange}
          onClearBedroom={onClearBedroom}
        />
      ) : null}
    </Stack>
  );
}
