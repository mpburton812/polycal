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

function localInputToIso(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
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
  const isEdit = Boolean(initialDetail);
  const proposerName =
    people.find((p) => p.id === currentUserId)?.displayName ?? "You";

  const [proposalType, setProposalType] = useState<"event" | "sleeping">("event");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [locationId, setLocationId] = useState("");
  const [intentionalSolo, setIntentionalSolo] = useState(false);
  const [isPoll, setIsPoll] = useState(false);
  const [batchMode, setBatchMode] = useState(false);
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [nightsPattern, setNightsPattern] = useState<"every" | "weekdays" | "weekends">("every");
  const [eventPrivacy, setEventPrivacy] = useState<"open" | "private" | "super_private">("open");
  const [slots, setSlots] = useState<SlotDraft[]>([{ startAt: "", endAt: "", label: "" }]);
  const [inviteeMode, setInviteeMode] = useState<Record<string, InviteeSelection>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const candidates = people.filter(
    (person) => person.id !== currentUserId && person.status === "active",
  );

  const locationName = places.find((p) => p.id === locationId)?.name ?? null;

  const previewStartIso = useMemo(() => {
    if (batchMode) return localInputToIso(rangeStart);
    const first = slots.find((s) => s.startAt);
    return first ? localInputToIso(first.startAt) : undefined;
  }, [batchMode, rangeStart, slots]);

  const previewEndIso = useMemo(() => {
    if (batchMode) return localInputToIso(rangeEnd);
    const first = slots.find((s) => s.startAt);
    return first?.endAt ? localInputToIso(first.endAt) : undefined;
  }, [batchMode, rangeEnd, slots]);

  const timePreview = formatTimeRange(previewStartIso ?? null, previewEndIso ?? null);
  const showPastWarning = isPastSchedule(previewStartIso);

  useEffect(() => {
    if (!open) return;
    if (initialDetail) {
      setProposalType(initialDetail.proposalType);
      setTitle(initialDetail.title);
      setDescription(initialDetail.description ?? "");
      setNotes(initialDetail.notes ?? "");
      setLocationId(initialDetail.locationId ?? "");
      setIntentionalSolo(initialDetail.intentionalSolo);
      setIsPoll(initialDetail.isPoll);
      setEventPrivacy(initialDetail.eventPrivacy);
      setSlots(
        initialDetail.timeSlots.length > 0
          ? initialDetail.timeSlots.map((slot) => ({
              startAt: toLocalInput(slot.startAt),
              endAt: toLocalInput(slot.endAt),
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
      setIntentionalSolo(false);
      setIsPoll(false);
      setBatchMode(false);
      setRangeStart("");
      setRangeEnd("");
      setNightsPattern("every");
      setEventPrivacy("open");
      setSlots([{ startAt: "", endAt: "", label: "" }]);
      setInviteeMode({});
    }
    setError(null);
  }, [open, initialDetail]);

  function handleClose() {
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

  function handleSave() {
    setError(null);
    const invitees = Object.entries(inviteeMode)
      .filter(([, role]) => role === "required" || role === "optional")
      .map(([userId, role]) => ({ userId, role: role as "required" | "optional" }));

    const timeSlots = slots
      .map((slot) => {
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
      notes: notes || undefined,
      intentionalSolo: proposalType === "sleeping" ? intentionalSolo : false,
      isPoll: proposalType === "event" ? isPoll : false,
      eventPrivacy,
      invitees,
      timeSlots,
    };

    startTransition(async () => {
      if (batchMode && proposalType === "sleeping" && !isEdit) {
        const rangeStartIso = localInputToIso(rangeStart);
        const rangeEndIso = localInputToIso(rangeEnd);
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

      const result = isEdit && initialDetail
        ? await updateDraftProposalAction({ ...payload, proposalId: initialDetail.id })
        : await createDraftProposalAction(payload);
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
      PaperProps={{ sx: { bgcolor: "transparent", boxShadow: "none", overflow: "visible" } }}
    >
      <Card variant="outlined" sx={{ ...proposalCardSx, bgcolor: "background.paper" }}>
        <CardContent sx={{ pb: 1 }}>
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
            title={batchMode ? "Batch date range" : isPoll ? "Poll time slots" : "Time window"}
            subtitle={
              batchMode
                ? "Creates multiple sleeping drafts across the range"
                : isPoll
                  ? "Add up to 5 options for invitees to choose from"
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
                  type="datetime-local"
                  value={rangeStart}
                  onChange={(event) => setRangeStart(event.target.value)}
                  fullWidth
                  size="small"
                  InputLabelProps={{ shrink: true }}
                />
                <TextField
                  label="Range end"
                  type="datetime-local"
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
                        label="Start"
                        type="datetime-local"
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
                        label="End (optional)"
                        type="datetime-local"
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
          </Stack>

          <Divider sx={{ my: 2 }} />

          <SectionHeader
            icon={<LocationOnOutlinedIcon fontSize="small" />}
            title="Location"
            subtitle="Optional place for this proposal"
          />
          <FormControl fullWidth size="small" sx={{ mb: 2 }}>
            <InputLabel id="proposal-place-label">Location</InputLabel>
            <Select
              labelId="proposal-place-label"
              label="Location"
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
            subtitle="Tap to cycle: none → required → optional → none"
          />
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

          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
        </CardContent>

        <CardActions sx={{ px: 2, pb: 2, pt: 0, justifyContent: "flex-end", gap: 1 }}>
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
        </CardActions>
      </Card>
    </Dialog>
  );
}
