"use client";

import AccessTimeIcon from "@mui/icons-material/AccessTime";
import EventNoteOutlinedIcon from "@mui/icons-material/EventNoteOutlined";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import LocationOnOutlinedIcon from "@mui/icons-material/LocationOnOutlined";
import NotesOutlinedIcon from "@mui/icons-material/NotesOutlined";
import PollOutlinedIcon from "@mui/icons-material/PollOutlined";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  Checkbox,
  Chip,
  Dialog,
  Divider,
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
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react";

import {
  createBatchSleepingProposalsAction,
  createDraftProposalAction,
  getProposalDetailAction,
  submitProposalAction,
  updateDraftProposalAction,
  type ProposalDetail,
  type ProposalPlaceOption,
} from "@/actions/proposals";
import type { PersonSummary } from "@/actions/users";

import {
  POLY_GREEN,
  POLY_GREEN_HOVER,
  POLY_GREEN_LIGHT,
  formatTimeRange,
  isPastSchedule,
  primaryButtonSx,
  proposalCardSx,
  typeBadgeLabel,
  typeChipSx,
  PAST_SCHEDULE_BG,
  PAST_SCHEDULE_ICON,
  PAST_SCHEDULE_TEXT,
} from "./proposalCardTheme";

type InviteeSelection = "none" | "required" | "optional";

interface SlotDraft {
  startAt: string;
  endAt: string;
  label: string;
}

interface ProposalDraftDialogProps {
  open: boolean;
  onClose: () => void;
  people: PersonSummary[];
  places: ProposalPlaceOption[];
  currentUserId: string;
  /** When set, dialog edits an existing draft instead of creating one. */
  initialDetail?: ProposalDetail | null;
}

function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Date-only input for sleeping proposals (no clock times). */
function toLocalDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function localInputToIso(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

function localDateToStartIso(value: string): string | undefined {
  if (!value) return undefined;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d, 0, 0, 0, 0).toISOString();
}

function localDateToEndIso(value: string): string | undefined {
  if (!value) return undefined;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d, 23, 59, 59, 999).toISOString();
}

function slotStartInput(iso: string | null | undefined, proposalType: "event" | "sleeping"): string {
  return proposalType === "sleeping" ? toLocalDateInput(iso) : toLocalInput(iso);
}

function SectionHeader({
  icon,
  title,
  subtitle,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
      <Box sx={{ color: POLY_GREEN, display: "flex" }}>{icon}</Box>
      <Box>
        <Typography variant="subtitle2" sx={{ fontWeight: 600, color: POLY_GREEN }}>
          {title}
        </Typography>
        {subtitle && (
          <Typography variant="caption" color="text.secondary">
            {subtitle}
          </Typography>
        )}
      </Box>
    </Stack>
  );
}

/**
 * Create or edit a proposal draft using the graphical card layout (PC-40).
 */
export function ProposalDraftDialog({
  open,
  onClose,
  people,
  places,
  currentUserId,
  initialDetail,
}: ProposalDraftDialogProps) {
  const router = useRouter();
  const [savedDraftId, setSavedDraftId] = useState<string | null>(null);
  const isEdit = Boolean(initialDetail || savedDraftId);
  const activeProposalId = initialDetail?.id ?? savedDraftId ?? null;
  const proposerName =
    people.find((p) => p.id === currentUserId)?.displayName ?? "You";

  const [proposalType, setProposalType] = useState<"event" | "sleeping">("event");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [locationId, setLocationId] = useState("");
  const [locationCustom, setLocationCustom] = useState("");
  const [bedroomIndex, setBedroomIndex] = useState<number | "">("");
  const [intentionalSolo, setIntentionalSolo] = useState(false);
  const [soloEvent, setSoloEvent] = useState(false);
  const [isPoll, setIsPoll] = useState(false);
  const [batchMode, setBatchMode] = useState(false);
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [nightsPattern, setNightsPattern] = useState<"every" | "weekdays" | "weekends">("every");
  const [eventPrivacy, setEventPrivacy] = useState<"open" | "private" | "super_private">("open");
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrencePattern, setRecurrencePattern] = useState<
    "daily" | "weekly" | "monthly" | "yearly"
  >("weekly");
  const [recurrenceCount, setRecurrenceCount] = useState(4);
  const [slots, setSlots] = useState<SlotDraft[]>([{ startAt: "", endAt: "", label: "" }]);
  const [inviteeMode, setInviteeMode] = useState<Record<string, InviteeSelection>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const candidates = people.filter(
    (person) => person.id !== currentUserId && person.status === "active",
  );

  const locationName =
    places.find((p) => p.id === locationId)?.name ?? (locationCustom.trim() || null);
  const selectedPlace = places.find((p) => p.id === locationId);
  const bedroomOptions =
    selectedPlace && selectedPlace.bedroomCount > 0
      ? Array.from({ length: selectedPlace.bedroomCount }, (_, index) => ({
          index,
          label: selectedPlace.bedroomNames[index] ?? `Bedroom ${index + 1}`,
        }))
      : [];

  const previewStartIso = useMemo(() => {
    if (batchMode) {
      return proposalType === "sleeping"
        ? localDateToStartIso(rangeStart)
        : localInputToIso(rangeStart);
    }
    const first = slots.find((s) => s.startAt);
    if (!first) return undefined;
    return proposalType === "sleeping"
      ? localDateToStartIso(first.startAt)
      : localInputToIso(first.startAt);
  }, [batchMode, rangeStart, slots, proposalType]);

  const previewEndIso = useMemo(() => {
    if (batchMode) {
      return proposalType === "sleeping"
        ? localDateToEndIso(rangeEnd)
        : localInputToIso(rangeEnd);
    }
    const first = slots.find((s) => s.startAt);
    if (!first) return undefined;
    if (proposalType === "sleeping") {
      return first.endAt
        ? localDateToEndIso(first.endAt)
        : localDateToEndIso(first.startAt);
    }
    return first.endAt ? localInputToIso(first.endAt) : undefined;
  }, [batchMode, rangeEnd, slots, proposalType]);

  const timePreview = formatTimeRange(
    previewStartIso ?? null,
    previewEndIso ?? null,
    proposalType,
  );
  const showPastWarning = isPastSchedule(previewStartIso);

  useEffect(() => {
    if (!open) return;
    if (initialDetail) {
      setProposalType(initialDetail.proposalType);
      setTitle(initialDetail.title);
      setDescription(initialDetail.description ?? "");
      setNotes(initialDetail.notes ?? "");
      setLocationId(initialDetail.locationId ?? "");
      setLocationCustom(
        initialDetail.locationId ? "" : (initialDetail.locationText ?? initialDetail.locationName ?? ""),
      );
      setBedroomIndex(
        initialDetail.bedroomIndex !== null && initialDetail.bedroomIndex !== undefined
          ? initialDetail.bedroomIndex
          : "",
      );
      setIntentionalSolo(initialDetail.intentionalSolo);
      setSoloEvent(initialDetail.proposalType === "event" && initialDetail.intentionalSolo);
      setIsPoll(initialDetail.isPoll);
      setEventPrivacy(initialDetail.eventPrivacy);
      setIsRecurring(initialDetail.isRecurrenceParent);
      if (initialDetail.recurrenceRule) {
        setRecurrencePattern(initialDetail.recurrenceRule.pattern);
        setRecurrenceCount(initialDetail.recurrenceRule.count);
      }
      setSlots(
        initialDetail.timeSlots.length > 0
          ? initialDetail.timeSlots.map((slot) => ({
              startAt: slotStartInput(slot.startAt, initialDetail.proposalType),
              endAt: slot.endAt
                ? slotStartInput(slot.endAt, initialDetail.proposalType)
                : "",
              label: slot.label ?? "",
            }))
          : [{ startAt: "", endAt: "", label: "" }],
      );
      const modes: Record<string, InviteeSelection> = {};
      for (const invitee of initialDetail.invitees) {
        modes[invitee.userId] = invitee.role;
      }
      setInviteeMode(modes);
    } else {
      setProposalType("event");
      setTitle("");
      setDescription("");
      setNotes("");
      setLocationId("");
      setLocationCustom("");
      setBedroomIndex("");
      setIntentionalSolo(false);
      setSoloEvent(false);
      setSavedDraftId(null);
      setIsPoll(false);
      setBatchMode(false);
      setRangeStart("");
      setRangeEnd("");
      setNightsPattern("every");
      setEventPrivacy("open");
      setIsRecurring(false);
      setRecurrencePattern("weekly");
      setRecurrenceCount(4);
      setSlots([{ startAt: "", endAt: "", label: "" }]);
      setInviteeMode({});
    }
    setError(null);
  }, [open, initialDetail]);

  function handleClose() {
    setSavedDraftId(null);
    onClose();
  }

  function applyDetailToForm(detail: ProposalDetail) {
    setProposalType(detail.proposalType);
    setTitle(detail.title);
    setDescription(detail.description ?? "");
    setNotes(detail.notes ?? "");
    setLocationId(detail.locationId ?? "");
    setLocationCustom(
      detail.locationId ? "" : (detail.locationText ?? detail.locationName ?? ""),
    );
    setBedroomIndex(
      detail.bedroomIndex !== null && detail.bedroomIndex !== undefined
        ? detail.bedroomIndex
        : "",
    );
    setIntentionalSolo(detail.intentionalSolo);
    setSoloEvent(detail.proposalType === "event" && detail.intentionalSolo);
    setIsPoll(detail.isPoll);
    setEventPrivacy(detail.eventPrivacy);
    setIsRecurring(detail.isRecurrenceParent);
    if (detail.recurrenceRule) {
      setRecurrencePattern(detail.recurrenceRule.pattern);
      setRecurrenceCount(detail.recurrenceRule.count);
    }
    setSlots(
      detail.timeSlots.length > 0
        ? detail.timeSlots.map((slot) => ({
            startAt: slotStartInput(slot.startAt, detail.proposalType),
            endAt: slot.endAt ? slotStartInput(slot.endAt, detail.proposalType) : "",
            label: slot.label ?? "",
          }))
        : [{ startAt: "", endAt: "", label: "" }],
    );
    const modes: Record<string, InviteeSelection> = {};
    for (const invitee of detail.invitees) {
      modes[invitee.userId] = invitee.role;
    }
    setInviteeMode(modes);
  }

  function cycleInvitee(personId: string) {
    setInviteeMode((current) => {
      const state = current[personId] ?? "none";
      const next: InviteeSelection =
        state === "none" ? "required" : state === "required" ? "optional" : "none";
      return { ...current, [personId]: next };
    });
  }

  function handleSave() {
    setError(null);
    const invitees = soloEvent || intentionalSolo
      ? []
      : Object.entries(inviteeMode)
          .filter(([, role]) => role === "required" || role === "optional")
          .map(([userId, role]) => ({ userId, role: role as "required" | "optional" }));

    const timeSlots = slots
      .map((slot) => {
        if (proposalType === "sleeping") {
          const startIso = localDateToStartIso(slot.startAt);
          if (!startIso) return null;
          const endIso = slot.endAt
            ? localDateToEndIso(slot.endAt)
            : localDateToEndIso(slot.startAt);
          return {
            startAt: startIso,
            endAt: endIso,
            label: slot.label.trim() || undefined,
          };
        }
        const startIso = localInputToIso(slot.startAt);
        if (!startIso) return null;
        return {
          startAt: startIso,
          endAt: localInputToIso(slot.endAt),
          label: slot.label.trim() || undefined,
        };
      })
      .filter((slot) => slot !== null);

    const payload = {
      title,
      description,
      proposalType,
      locationId: locationId || undefined,
      locationText: locationCustom.trim() || undefined,
      bedroomIndex:
        proposalType === "sleeping" && bedroomIndex !== "" ? bedroomIndex : undefined,
      notes: notes || undefined,
      intentionalSolo:
        proposalType === "sleeping" ? intentionalSolo : soloEvent,
      isPoll: proposalType === "event" ? isPoll : false,
      eventPrivacy,
      isRecurring: !batchMode && isRecurring,
      recurrenceRule:
        !batchMode && isRecurring
          ? { pattern: recurrencePattern, interval: 1, count: recurrenceCount }
          : undefined,
      invitees,
      timeSlots,
    };

    startTransition(async () => {
      if (batchMode && proposalType === "sleeping" && !isEdit) {
        const rangeStartIso =
          proposalType === "sleeping"
            ? localDateToStartIso(rangeStart)
            : localInputToIso(rangeStart);
        const rangeEndIso =
          proposalType === "sleeping"
            ? localDateToEndIso(rangeEnd)
            : localInputToIso(rangeEnd);
        if (!rangeStartIso || !rangeEndIso) {
          setError("Batch mode requires a valid date range.");
          return;
        }
        const result = await createBatchSleepingProposalsAction({
          title,
          description,
          locationId: locationId || undefined,
          notes: notes || undefined,
          intentionalSolo: intentionalSolo,
          invitees,
          rangeStart: rangeStartIso,
          rangeEnd: rangeEndIso,
          nightsPattern,
        });
        if (!result.ok) {
          setError(result.message);
          return;
        }
        handleClose();
        router.refresh();
        return;
      }

      const editId = initialDetail?.id ?? savedDraftId;
      let proposalId = editId;
      if (isEdit && editId) {
        const result = await updateDraftProposalAction({ ...payload, proposalId: editId });
        if (!result.ok) {
          setError(result.message);
          return;
        }
      } else {
        const result = await createDraftProposalAction(payload);
        if (!result.ok) {
          setError(result.message);
          return;
        }
        proposalId = result.proposalId ?? null;
      }

      if (!proposalId) {
        handleClose();
        router.refresh();
        return;
      }

      setSavedDraftId(proposalId);
      const detailResult = await getProposalDetailAction(proposalId);
      if (detailResult.ok && detailResult.detail) {
        applyDetailToForm(detailResult.detail);
      }
      router.refresh();
    });
  }

  function handleSubmit() {
    const proposalId = initialDetail?.id ?? savedDraftId;
    if (!proposalId) return;
    setError(null);
    startTransition(async () => {
      const result = await submitProposalAction(proposalId, false);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      handleClose();
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      fullWidth
      maxWidth="sm"
      scroll="paper"
      PaperProps={{
        sx: { bgcolor: "transparent", boxShadow: "none", overflow: "visible", maxHeight: "92vh" },
      }}
    >
      <Card variant="outlined" sx={{ ...proposalCardSx, bgcolor: "background.paper", maxHeight: "92vh", display: "flex", flexDirection: "column" }}>
        <CardContent sx={{ pb: 1, overflow: "auto", flex: 1 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 1.5 }}>
            <Chip label={typeBadgeLabel(proposalType)} size="small" sx={typeChipSx} />
            <Typography variant="caption" color="text.secondary" sx={{ textAlign: "right" }}>
              PROPOSED BY {proposerName.toUpperCase()}
            </Typography>
          </Stack>

          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" sx={{ mb: 2 }}>
            <Typography variant="h6" component="h2" sx={{ fontSize: "1.1rem", fontWeight: 600 }}>
              {isEdit ? "Edit draft" : "New proposal"}
            </Typography>
            <Chip label="DRAFT" size="small" variant="outlined" sx={{ fontWeight: 600, fontSize: "0.65rem" }} />
            {isPoll && (
              <Chip
                icon={<PollOutlinedIcon sx={{ fontSize: "14px !important" }} />}
                label="Poll"
                size="small"
                sx={{ bgcolor: POLY_GREEN, color: "#fff", fontSize: "0.65rem" }}
              />
            )}
          </Stack>

          {(timePreview || locationName) && (
            <Box sx={{ mb: 2, p: 1.5, bgcolor: POLY_GREEN_LIGHT, borderRadius: 1 }}>
              {timePreview && (
                <Stack direction="row" spacing={0.5} alignItems="center">
                  <AccessTimeIcon sx={{ fontSize: 16, color: POLY_GREEN }} />
                  <Typography variant="body2" sx={{ color: POLY_GREEN, fontWeight: 500 }}>
                    {timePreview}
                  </Typography>
                </Stack>
              )}
              <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: timePreview ? 0.5 : 0 }}>
                <LocationOnOutlinedIcon sx={{ fontSize: 16, color: POLY_GREEN }} />
                <Typography variant="body2" sx={{ color: POLY_GREEN }}>
                  {locationName ?? "No location set"}
                </Typography>
              </Stack>
            </Box>
          )}

          {showPastWarning && (
            <Box
              sx={{
                mb: 2,
                p: 1.5,
                bgcolor: PAST_SCHEDULE_BG,
                borderRadius: 1,
                display: "flex",
                alignItems: "flex-start",
                gap: 1,
              }}
            >
              <WarningAmberIcon sx={{ fontSize: 20, color: PAST_SCHEDULE_ICON, mt: 0.25 }} />
              <Box>
                <Typography variant="body2" sx={{ color: PAST_SCHEDULE_TEXT, fontWeight: 600 }}>
                  Past schedule
                </Typography>
                <Typography variant="caption" sx={{ color: PAST_SCHEDULE_TEXT }}>
                  This proposal is scheduled in the past. Confirm the date and time are intentional
                  before submitting.
                </Typography>
              </Box>
            </Box>
          )}

          <SectionHeader
            icon={<EventNoteOutlinedIcon fontSize="small" />}
            title="Proposal details"
            subtitle="Type, title, and description"
          />
          <Stack spacing={2} sx={{ mb: 2 }}>
            <FormControl fullWidth size="small">
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
              size="small"
              placeholder="Untitled Proposal"
            />
            <TextField
              label="Description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              required
              fullWidth
              multiline
              minRows={2}
              size="small"
            />
            <FormControl fullWidth size="small">
              <InputLabel id="proposal-privacy-label">Privacy</InputLabel>
              <Select
                labelId="proposal-privacy-label"
                label="Privacy"
                value={eventPrivacy}
                onChange={(event) =>
                  setEventPrivacy(event.target.value as "open" | "private" | "super_private")
                }
              >
                <MenuItem value="open">Open</MenuItem>
                <MenuItem value="private">Private</MenuItem>
                <MenuItem value="super_private">Super private</MenuItem>
              </Select>
            </FormControl>
          </Stack>

          <Divider sx={{ my: 2 }} />

          <SectionHeader
            icon={<AccessTimeIcon fontSize="small" />}
            title={
              batchMode
                ? "Batch date range"
                : isPoll
                  ? "Poll time slots"
                  : proposalType === "sleeping"
                    ? "Dates"
                    : "Time window"
            }
            subtitle={
              batchMode
                ? "Creates multiple sleeping drafts across the range"
                : isPoll
                  ? "Add up to 5 options for invitees to choose from"
                  : proposalType === "sleeping"
                    ? "Which night(s) — dates only, no times"
                    : "When does this proposal happen?"
            }
          />
          <Stack spacing={1.5} sx={{ mb: 2 }}>
            {proposalType === "sleeping" && !isEdit && (
              <FormControlLabel
                control={
                  <Checkbox
                    checked={batchMode}
                    onChange={(event) => setBatchMode(event.target.checked)}
                    sx={{ color: POLY_GREEN, "&.Mui-checked": { color: POLY_GREEN } }}
                  />
                }
                label="Batch / recurring nights (create multiple drafts)"
              />
            )}
            {proposalType === "event" && (
              <FormControlLabel
                control={
                  <Checkbox
                    checked={isPoll}
                    onChange={(event) => setIsPoll(event.target.checked)}
                    sx={{ color: POLY_GREEN, "&.Mui-checked": { color: POLY_GREEN } }}
                  />
                }
                label="Time poll (multiple slot options)"
              />
            )}
            {batchMode ? (
              <>
                <TextField
                  label="Range start"
                  type={proposalType === "sleeping" ? "date" : "datetime-local"}
                  value={rangeStart}
                  onChange={(event) => setRangeStart(event.target.value)}
                  fullWidth
                  size="small"
                  InputLabelProps={{ shrink: true }}
                />
                <TextField
                  label="Range end"
                  type={proposalType === "sleeping" ? "date" : "datetime-local"}
                  value={rangeEnd}
                  onChange={(event) => setRangeEnd(event.target.value)}
                  fullWidth
                  size="small"
                  InputLabelProps={{ shrink: true }}
                />
                <FormControl fullWidth size="small">
                  <InputLabel id="nights-pattern-label">Nights pattern</InputLabel>
                  <Select
                    labelId="nights-pattern-label"
                    label="Nights pattern"
                    value={nightsPattern}
                    onChange={(event) =>
                      setNightsPattern(event.target.value as "every" | "weekdays" | "weekends")
                    }
                  >
                    <MenuItem value="every">Every night</MenuItem>
                    <MenuItem value="weekdays">Weekdays only</MenuItem>
                    <MenuItem value="weekends">Weekends only</MenuItem>
                  </Select>
                </FormControl>
              </>
            ) : (
              <>
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
                          setSlots(next);
                        }}
                        fullWidth
                        size="small"
                        sx={{ mb: 1 }}
                      />
                    )}
                    <Stack spacing={1}>
                      <TextField
                        label={proposalType === "sleeping" ? "Night of" : "Start"}
                        type={proposalType === "sleeping" ? "date" : "datetime-local"}
                        value={slot.startAt}
                        onChange={(event) => {
                          const next = [...slots];
                          next[index] = { ...next[index], startAt: event.target.value };
                          setSlots(next);
                        }}
                        fullWidth
                        size="small"
                        InputLabelProps={{ shrink: true }}
                      />
                      <TextField
                        label={
                          proposalType === "sleeping" ? "Through (optional)" : "End (optional)"
                        }
                        type={proposalType === "sleeping" ? "date" : "datetime-local"}
                        value={slot.endAt}
                        onChange={(event) => {
                          const next = [...slots];
                          next[index] = { ...next[index], endAt: event.target.value };
                          setSlots(next);
                        }}
                        fullWidth
                        size="small"
                        InputLabelProps={{ shrink: true }}
                      />
                    </Stack>
                  </Box>
                ))}
                {isPoll && slots.length < 5 && (
                  <Button
                    size="small"
                    variant="outlined"
                    sx={{ borderColor: POLY_GREEN, color: POLY_GREEN }}
                    onClick={() => setSlots([...slots, { startAt: "", endAt: "", label: "" }])}
                  >
                    Add poll option
                  </Button>
                )}
              </>
            )}
            {!batchMode && !isPoll && (
              <>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={isRecurring}
                      onChange={(event) => setIsRecurring(event.target.checked)}
                      sx={{ color: POLY_GREEN, "&.Mui-checked": { color: POLY_GREEN } }}
                    />
                  }
                  label="Recurring series (events and sleeping)"
                />
                {isRecurring && (
                  <Stack direction="row" spacing={1}>
                    <FormControl fullWidth size="small">
                      <InputLabel id="recurrence-pattern-label">Pattern</InputLabel>
                      <Select
                        labelId="recurrence-pattern-label"
                        label="Pattern"
                        value={recurrencePattern}
                        onChange={(event) =>
                          setRecurrencePattern(
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
                        setRecurrenceCount(
                          Math.min(52, Math.max(2, Number(event.target.value) || 2)),
                        )
                      }
                      inputProps={{ min: 2, max: 52 }}
                      sx={{ width: 140 }}
                    />
                  </Stack>
                )}
              </>
            )}
          </Stack>

          <Divider sx={{ my: 2 }} />

          <SectionHeader
            icon={<LocationOnOutlinedIcon fontSize="small" />}
            title="Location"
            subtitle="Your places, sleeping partners' places, custom text, or leave blank"
          />
          <Autocomplete
            freeSolo
            options={places}
            getOptionLabel={(option) => (typeof option === "string" ? option : option.name)}
            value={
              locationId
                ? (places.find((place) => place.id === locationId) ?? null)
                : locationCustom || null
            }
            onChange={(_, newValue) => {
              if (!newValue) {
                setLocationId("");
                setLocationCustom("");
                setBedroomIndex("");
              } else if (typeof newValue === "string") {
                setLocationId("");
                setLocationCustom(newValue);
                setBedroomIndex("");
              } else {
                setLocationId(newValue.id);
                setLocationCustom("");
                setBedroomIndex("");
              }
            }}
            onInputChange={(_, value, reason) => {
              if (reason === "input" && !locationId) {
                setLocationCustom(value);
              }
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Location"
                size="small"
                placeholder="Select a place, type custom text, or leave blank"
              />
            )}
            sx={{ mb: 2 }}
          />

          {proposalType === "sleeping" && bedroomOptions.length > 0 && (
            <FormControl fullWidth size="small" sx={{ mb: 2 }}>
              <InputLabel id="proposal-bedroom-label">Bedroom</InputLabel>
              <Select
                labelId="proposal-bedroom-label"
                label="Bedroom"
                value={bedroomIndex === "" ? "" : String(bedroomIndex)}
                onChange={(event) => {
                  const value = event.target.value;
                  setBedroomIndex(value === "" ? "" : Number(value));
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

          {proposalType === "sleeping" && (
            <ToggleButtonGroup
              exclusive
              value={intentionalSolo ? "solo" : "network"}
              onChange={(_, value) => {
                if (value) {
                  setIntentionalSolo(value === "solo");
                  if (value === "solo") setInviteeMode({});
                }
              }}
              size="small"
              sx={{
                mb: 2,
                "& .MuiToggleButton-root.Mui-selected": {
                  bgcolor: POLY_GREEN,
                  color: "#fff",
                  "&:hover": { bgcolor: POLY_GREEN_HOVER },
                },
              }}
            >
              <ToggleButton value="network">With invitees</ToggleButton>
              <ToggleButton value="solo">Intentional solo</ToggleButton>
            </ToggleButtonGroup>
          )}

          {proposalType === "event" && (
            <ToggleButtonGroup
              exclusive
              value={soloEvent ? "solo" : "group"}
              onChange={(_, value) => {
                if (value) {
                  const nextSolo = value === "solo";
                  setSoloEvent(nextSolo);
                  if (nextSolo) setInviteeMode({});
                }
              }}
              size="small"
              sx={{
                mb: 2,
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
          )}

          <SectionHeader
            icon={<NotesOutlinedIcon fontSize="small" />}
            title="Notes"
            subtitle="Private notes visible to invitees"
          />
          <TextField
            label="Notes (optional)"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            fullWidth
            multiline
            minRows={2}
            size="small"
            sx={{ mb: 2 }}
          />

          <Divider sx={{ my: 2 }} />

          <SectionHeader
            icon={<GroupsOutlinedIcon fontSize="small" />}
            title="Invitees"
            subtitle={
              soloEvent || intentionalSolo
                ? "Solo proposals do not include invitees"
                : "Tap to cycle: none → required → optional → none"
            }
          />
          {!soloEvent && !intentionalSolo && (
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

          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
        </CardContent>

        <CardActions sx={{ px: 2, pb: 2, pt: 0, justifyContent: "flex-end", gap: 1, flexShrink: 0 }}>
          <Button onClick={handleClose} color="inherit">
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={!title.trim() || !description.trim() || pending}
            onClick={handleSave}
            sx={primaryButtonSx}
          >
            {isEdit ? "Save draft" : "Create draft"}
          </Button>
          {isEdit && activeProposalId && (
            <Button
              variant="contained"
              disabled={!title.trim() || !description.trim() || pending}
              onClick={handleSubmit}
              sx={primaryButtonSx}
            >
              Submit
            </Button>
          )}
        </CardActions>
      </Card>
    </Dialog>
  );
}
