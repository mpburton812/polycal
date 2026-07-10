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
  DialogActions,
  DialogContent,
  DialogTitle,
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
import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";

import {
  createDraftProposalAction,
  deleteDraftProposalAction,
  getProposalDetailAction,
  listAcceptedSleepingPartnerIdsAction,
  listSleepingLocationOptionsAction,
  submitProposalAction,
  updateDraftProposalAction,
  type ProposalConflictWarning,
  type ProposalDetail,
  type ProposalPlaceOption,
} from "@/actions/proposals";
import type { PersonSummary } from "@/actions/users";
import { useToast } from "@/components/providers/ToastProvider";
import {
  buildBatchEntriesFromRows,
  buildEmptyGridRows,
  FAST_SLEEPING_GRID_DAYS,
  rowsFromBatchEntries,
  type FastSleepingRow,
} from "@/lib/proposals/fast-sleeping-plan";

import { FastSleepingPlanGrid } from "./FastSleepingPlanGrid";
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
import { GARDEN_TOKENS } from "@/theme/tokens";
import { sleepingDateToStartIso } from "@/lib/proposals/sleeping-schedule";
import { formatSleepingDisplayTitle } from "@/lib/proposals/sleeping-display";
import {
  minutesToReminderDisplay,
  reminderOffsetToMinutes,
} from "@/lib/proposals/event-reminder";
import { ProposalScheduleField } from "./ProposalScheduleFields";
import { EventIconPicker } from "./EventIconPicker";
import { isEventIconKey, type EventIconKey } from "@/lib/event-icons/registry";

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
  /** Locks proposal type for new drafts opened from a specific FAB action (PC-65). */
  lockedProposalType?: "event" | "sleeping";
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

function slotStartInput(
  iso: string | null | undefined,
  proposalType: "event" | "sleeping",
  isAllDay = false,
): string {
  return proposalType === "sleeping" || isAllDay
    ? toLocalDateInput(iso)
    : toLocalInput(iso);
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

function ConflictWarningList({ warnings }: { warnings: ProposalConflictWarning[] }) {
  return (
    <>
      {warnings.map((warning, index) => (
        <Typography key={`${warning.userId}-${index}`} variant="body2" sx={{ mb: 0.5 }}>
          {warning.conflictKind === "place_asset" ? "Place" : warning.displayName} overlaps with
          &quot;{warning.conflictingTitle}&quot; ({warning.conflictingState})
        </Typography>
      ))}
    </>
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
  lockedProposalType,
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
  const [allDay, setAllDay] = useState(false);
  const [batchMode, setBatchMode] = useState(false);
  const [fastPlanRows, setFastPlanRows] = useState<FastSleepingRow[]>(() => buildEmptyGridRows());
  const [batchLocationOptions, setBatchLocationOptions] = useState<ProposalPlaceOption[]>([]);
  const [acceptedPartnerIds, setAcceptedPartnerIds] = useState<string[]>([]);
  const [sleepingLocationOptions, setSleepingLocationOptions] = useState<ProposalPlaceOption[]>(
    [],
  );
  const [eventPrivacy, setEventPrivacy] = useState<"open" | "private" | "super_private">("open");
  const [eventIconKey, setEventIconKey] = useState<EventIconKey | null>(null);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrencePattern, setRecurrencePattern] = useState<
    "daily" | "weekly" | "monthly" | "yearly"
  >("weekly");
  const [recurrenceCount, setRecurrenceCount] = useState(4);
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderValue, setReminderValue] = useState(1);
  const [reminderUnit, setReminderUnit] = useState<"days" | "hours" | "minutes">("hours");
  const [slots, setSlots] = useState<SlotDraft[]>([{ startAt: "", endAt: "", label: "" }]);
  const [inviteeMode, setInviteeMode] = useState<Record<string, InviteeSelection>>({});
  const { showToast } = useToast();
  const [conflictWarnings, setConflictWarnings] = useState<ProposalConflictWarning[]>([]);
  const [showConflictConfirm, setShowConflictConfirm] = useState(false);
  const [conflictDialogOpen, setConflictDialogOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const contentRef = useRef<HTMLDivElement>(null);

  const sleepingCandidates = useMemo(
    () =>
      people.filter(
        (person) =>
          person.id !== currentUserId &&
          person.status === "active" &&
          acceptedPartnerIds.includes(person.id),
      ),
    [people, currentUserId, acceptedPartnerIds],
  );

  const eventCandidates = useMemo(
    () => people.filter((person) => person.id !== currentUserId && person.status === "active"),
    [people, currentUserId],
  );

  const candidates = proposalType === "sleeping" ? sleepingCandidates : eventCandidates;

  const isSoloProposal =
    proposalType === "sleeping" ? intentionalSolo : soloEvent;

  const locationOptions =
    proposalType === "sleeping" && batchMode
      ? batchLocationOptions
      : proposalType === "sleeping"
        ? sleepingLocationOptions
        : places;

  const configuredBatchEntries = useMemo(
    () => (batchMode ? buildBatchEntriesFromRows(fastPlanRows) : []),
    [batchMode, fastPlanRows],
  );

  const locationName =
    locationOptions.find((p) => p.id === locationId)?.name ?? (locationCustom.trim() || null);
  const selectedPlace = locationOptions.find((p) => p.id === locationId);
  const bedroomOptions =
    selectedPlace && selectedPlace.bedroomCount > 0
      ? Array.from({ length: selectedPlace.bedroomCount }, (_, index) => ({
          index,
          label: selectedPlace.bedroomNames[index] ?? `Bedroom ${index + 1}`,
        }))
      : [];

  const previewStartIso = useMemo(() => {
    if (batchMode && configuredBatchEntries.length > 0) {
      const sorted = [...configuredBatchEntries]
        .map((entry) => localDateToStartIso(entry.nightDate.slice(0, 10)))
        .filter((iso): iso is string => Boolean(iso))
        .sort((a, b) => a.localeCompare(b));
      return sorted[0];
    }
    const first = slots.find((s) => s.startAt);
    if (!first) return undefined;
    return proposalType === "sleeping" || allDay
      ? localDateToStartIso(first.startAt)
      : localInputToIso(first.startAt);
  }, [batchMode, configuredBatchEntries, slots, proposalType, allDay]);

  const previewEndIso = useMemo(() => {
    if (batchMode && configuredBatchEntries.length > 0) {
      const sorted = [...configuredBatchEntries]
        .map((entry) => localDateToEndIso(entry.nightDate.slice(0, 10)))
        .filter((iso): iso is string => Boolean(iso))
        .sort((a, b) => a.localeCompare(b));
      return sorted[sorted.length - 1];
    }
    const first = slots.find((s) => s.startAt);
    if (!first) return undefined;
    if (proposalType === "sleeping" || allDay) {
      return first.endAt
        ? localDateToEndIso(first.endAt)
        : localDateToEndIso(first.startAt);
    }
    return first.endAt ? localInputToIso(first.endAt) : undefined;
  }, [batchMode, configuredBatchEntries, slots, proposalType, allDay]);

  useEffect(() => {
    if (!open) return;
    void listAcceptedSleepingPartnerIdsAction().then(setAcceptedPartnerIds);
  }, [open]);

  useEffect(() => {
    if (!open || proposalType !== "sleeping" || batchMode) {
      return;
    }
    const inviteeIds = isSoloProposal
      ? []
      : Object.entries(inviteeMode)
          .filter(([, role]) => role === "required" || role === "optional")
          .map(([userId]) => userId);
    void listSleepingLocationOptionsAction(inviteeIds).then(setSleepingLocationOptions);
  }, [open, proposalType, batchMode, isSoloProposal, inviteeMode]);

  useEffect(() => {
    if (!open || !batchMode || proposalType !== "sleeping") {
      return;
    }
    const inviteeIds = [
      ...new Set(
        fastPlanRows.flatMap((row) => (row.intentionalSolo ? [] : row.inviteeUserIds)),
      ),
    ];
    void listSleepingLocationOptionsAction(inviteeIds).then(setBatchLocationOptions);
  }, [open, batchMode, proposalType, fastPlanRows]);

  useEffect(() => {
    if (!batchMode) return;
    setFastPlanRows((current) => (current.length === FAST_SLEEPING_GRID_DAYS ? current : buildEmptyGridRows()));
  }, [batchMode]);

  const timePreview = formatTimeRange(
    previewStartIso ?? null,
    previewEndIso ?? null,
    proposalType,
    proposalType === "event" && allDay,
  );
  const showPastWarning = isPastSchedule(previewStartIso);

  useEffect(() => {
    if (!open) return;
    if (initialDetail) {
      setSavedDraftId(initialDetail.id);
      setBatchMode(initialDetail.isBatchSleeping);
      setFastPlanRows(
        initialDetail.isBatchSleeping && initialDetail.batchEntries.length > 0
          ? rowsFromBatchEntries(initialDetail.batchEntries)
          : buildEmptyGridRows(),
      );
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
      setIntentionalSolo(
        initialDetail.proposalType === "sleeping" ? initialDetail.intentionalSolo : false,
      );
      setSoloEvent(initialDetail.proposalType === "event" && initialDetail.intentionalSolo);
      setIsPoll(initialDetail.isPoll);
      setAllDay(initialDetail.proposalType === "event" && initialDetail.isAllDay);
      setEventPrivacy(initialDetail.eventPrivacy);
      setEventIconKey(
        isEventIconKey(initialDetail.eventIconKey) ? initialDetail.eventIconKey : null,
      );
      setIsRecurring(initialDetail.isRecurrenceParent);
      if (initialDetail.recurrenceRule) {
        setRecurrencePattern(initialDetail.recurrenceRule.pattern);
        setRecurrenceCount(initialDetail.recurrenceRule.count);
      }
      setSlots(
        initialDetail.timeSlots.length > 0
          ? initialDetail.timeSlots.map((slot) => ({
              startAt: slotStartInput(
                slot.startAt,
                initialDetail.proposalType,
                initialDetail.isAllDay,
              ),
              endAt: slot.endAt
                ? slotStartInput(
                    slot.endAt,
                    initialDetail.proposalType,
                    initialDetail.isAllDay,
                  )
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
      const reminder = minutesToReminderDisplay(initialDetail.reminderOffsetMinutes);
      setReminderEnabled(reminder.enabled);
      setReminderValue(reminder.value);
      setReminderUnit(reminder.unit);
    } else if (!savedDraftId) {
      setProposalType(lockedProposalType ?? "event");
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
      setAllDay(false);
      setBatchMode(false);
      setFastPlanRows(buildEmptyGridRows());
      setBatchLocationOptions([]);
      setEventPrivacy("open");
      setIsRecurring(false);
      setRecurrencePattern("weekly");
      setRecurrenceCount(4);
      setSlots([{ startAt: "", endAt: "", label: "" }]);
      setInviteeMode({});
      setReminderEnabled(false);
      setReminderValue(1);
      setReminderUnit("hours");
    }
  }, [open, initialDetail, lockedProposalType, savedDraftId]);

  function handleClose() {
    setSavedDraftId(null);
    onClose();
  }

  function applyDetailToForm(detail: ProposalDetail) {
    setBatchMode(detail.isBatchSleeping);
    setFastPlanRows(
      detail.isBatchSleeping && detail.batchEntries.length > 0
        ? rowsFromBatchEntries(detail.batchEntries)
        : buildEmptyGridRows(),
    );
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
    setIntentionalSolo(detail.proposalType === "sleeping" ? detail.intentionalSolo : false);
    setSoloEvent(detail.proposalType === "event" && detail.intentionalSolo);
    setIsPoll(detail.isPoll);
    setAllDay(detail.proposalType === "event" && detail.isAllDay);
    setEventPrivacy(detail.eventPrivacy);
    setEventIconKey(isEventIconKey(detail.eventIconKey) ? detail.eventIconKey : null);
    setIsRecurring(detail.isRecurrenceParent);
    if (detail.recurrenceRule) {
      setRecurrencePattern(detail.recurrenceRule.pattern);
      setRecurrenceCount(detail.recurrenceRule.count);
    }
    setSlots(
      detail.timeSlots.length > 0
        ? detail.timeSlots.map((slot) => ({
            startAt: slotStartInput(slot.startAt, detail.proposalType, detail.isAllDay),
            endAt: slot.endAt
              ? slotStartInput(slot.endAt, detail.proposalType, detail.isAllDay)
              : "",
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

  function buildDraftPayload() {
    const invitees = isSoloProposal
      ? []
      : Object.entries(inviteeMode)
          .filter(([, role]) => role === "required" || role === "optional")
          .map(([userId, role]) => ({ userId, role: role as "required" | "optional" }));

    const timeSlots = batchMode
      ? []
      : slots
          .map((slot) => {
            if (proposalType === "sleeping") {
              const startIso = sleepingDateToStartIso(slot.startAt);
              if (!startIso) return null;
              const endIso =
                slot.endAt && slot.endAt !== slot.startAt
                  ? sleepingDateToStartIso(slot.endAt)
                  : null;
              return {
                startAt: startIso,
                endAt: endIso ?? undefined,
                label: slot.label.trim() || undefined,
              };
            }
            if (allDay) {
              // All-day event: slot inputs are calendar dates; store as local
              // midnight start and end-of-day end so overlap/display work.
              const startIso = localDateToStartIso(slot.startAt);
              if (!startIso) return null;
              const endSource = slot.endAt || slot.startAt;
              return {
                startAt: startIso,
                endAt: localDateToEndIso(endSource),
                label: slot.label.trim() || undefined,
                isAllDay: true,
              };
            }
            const startIso = localInputToIso(slot.startAt);
            if (!startIso) return null;
            return {
              startAt: startIso,
              endAt: localInputToIso(slot.endAt),
              label: slot.label.trim() || undefined,
              isAllDay: false,
            };
          })
          .filter((slot) => slot !== null);

    return {
      title:
        proposalType === "sleeping"
          ? formatSleepingDisplayTitle({
              proposerName,
              inviteeNames: isSoloProposal
                ? []
                : invitees.map(
                    (invitee) =>
                      people.find((person) => person.id === invitee.userId)?.displayName ??
                      invitee.userId,
                  ),
              intentionalSolo: isSoloProposal,
              locationName: batchMode
                ? (configuredBatchEntries.find((entry) => entry.locationText || entry.locationId)
                    ? locationOptions.find(
                        (place) =>
                          place.id ===
                          configuredBatchEntries.find((entry) => entry.locationId)?.locationId,
                      )?.name ??
                      configuredBatchEntries.find((entry) => entry.locationText)?.locationText ??
                      null
                    : null)
                : locationName,
              state: "draft",
            })
          : title,
      description,
      proposalType,
      locationId: batchMode ? undefined : locationId || undefined,
      locationText: batchMode ? undefined : locationCustom.trim() || undefined,
      bedroomIndex:
        proposalType === "sleeping" && !batchMode && bedroomIndex !== "" ? bedroomIndex : undefined,
      notes: notes || undefined,
      intentionalSolo: batchMode ? false : isSoloProposal,
      isPoll: proposalType === "event" ? isPoll : false,
      isAllDay: proposalType === "event" ? allDay : false,
      eventPrivacy,
      eventIconKey: proposalType === "event" ? eventIconKey : null,
      isRecurring: !batchMode && isRecurring,
      recurrenceRule:
        !batchMode && isRecurring
          ? { pattern: recurrencePattern, interval: 1, count: recurrenceCount }
          : undefined,
      invitees: batchMode ? [] : invitees,
      timeSlots,
      isBatchSleeping: batchMode && proposalType === "sleeping",
      batchEntries:
        batchMode && proposalType === "sleeping" ? configuredBatchEntries : undefined,
      reminderOffsetMinutes:
        proposalType === "event" && reminderEnabled
          ? reminderOffsetToMinutes(reminderValue, reminderUnit)
          : null,
    };
  }

  /** Persists the current form to the server; returns proposal id or null on failure (PC-59). */
  async function persistDraft(): Promise<string | null> {
    const payload = buildDraftPayload();

    if (batchMode && proposalType === "sleeping" && (payload.batchEntries?.length ?? 0) === 0) {
      showToast("Add at least one night to the batch.", "error");
      return null;
    }

    const editId = initialDetail?.id ?? savedDraftId;
    let proposalId = editId;
    if (isEdit && editId) {
      const result = await updateDraftProposalAction({ ...payload, proposalId: editId });
      if (!result.ok) {
        showToast(result.message, "error");
        return null;
      }
    } else {
      const result = await createDraftProposalAction(payload);
      if (!result.ok) {
        showToast(result.message, "error");
        return null;
      }
      proposalId = result.proposalId ?? null;
    }

    if (!proposalId) return null;

    setSavedDraftId(proposalId);
    const detailResult = await getProposalDetailAction(proposalId);
    if (detailResult.ok && detailResult.detail) {
      const localPayload = buildDraftPayload();
      const detail = detailResult.detail;
      applyDetailToForm({
        ...detail,
        title: detail.title.trim() || localPayload.title,
        description: detail.description?.trim() ? detail.description : localPayload.description ?? null,
        notes: detail.notes?.trim() ? detail.notes : localPayload.notes ?? null,
      });
    }
    return proposalId;
  }

  function handleDelete() {
    const editId = initialDetail?.id ?? savedDraftId;
    if (!editId || !window.confirm("Delete this draft?")) return;
    startTransition(async () => {
      const result = await deleteDraftProposalAction(editId);
      showToast(result.message, result.ok ? "success" : "error");
      if (result.ok) {
        onClose();
        router.refresh();
      }
    });
  }

  const draftReady = proposalType === "sleeping" || Boolean(title.trim());

  function handleSave() {
    startTransition(async () => {
      const proposalId = await persistDraft();
      if (!proposalId) return;
      router.refresh();
    });
  }

  function handleSubmit(confirm = false) {
    startTransition(async () => {
      const proposalId = await persistDraft();
      if (!proposalId) return;

      const result = await submitProposalAction(proposalId, confirm);
      if (!result.ok && result.warnings && result.warnings.length > 0) {
        setConflictWarnings(result.warnings);
        setShowConflictConfirm(true);
        setConflictDialogOpen(true);
        contentRef.current?.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      if (!result.ok) {
        showToast(result.message, "error");
        return;
      }
      showToast(result.message, "success");
      setConflictWarnings([]);
      setShowConflictConfirm(false);
      setConflictDialogOpen(false);
      handleClose();
      router.refresh();
    });
  }

  return (
    <>
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
      <Card variant="outlined" sx={{ ...proposalCardSx, bgcolor: GARDEN_TOKENS.surface, maxHeight: "92vh", display: "flex", flexDirection: "column" }}>
        <CardContent ref={contentRef} sx={{ pb: 1, overflow: "auto", flex: 1 }}>
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

          {showConflictConfirm && conflictWarnings.length > 0 && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                Schedule conflicts
              </Typography>
              <ConflictWarningList warnings={conflictWarnings} />
              <Button
                size="small"
                variant="contained"
                sx={{ mt: 1, ...primaryButtonSx }}
                onClick={() => handleSubmit(true)}
                disabled={pending}
              >
                Submit anyway
              </Button>
            </Alert>
          )}

          <SectionHeader
            icon={<EventNoteOutlinedIcon fontSize="small" />}
            title="Proposal details"
            subtitle="Type, title, and description"
          />
          <Stack spacing={2} sx={{ mb: 2 }}>
            {!lockedProposalType && (
              <FormControl fullWidth size="small">
                <InputLabel id="proposal-type-label">Type</InputLabel>
                <Select
                  labelId="proposal-type-label"
                  label="Type"
                  value={proposalType}
                  onChange={(event) => {
                    const nextType = event.target.value as "event" | "sleeping";
                    setProposalType(nextType);
                    if (nextType === "event") {
                      setIntentionalSolo(false);
                    } else {
                      setSoloEvent(false);
                    }
                  }}
                >
                  <MenuItem value="event">Event</MenuItem>
                  <MenuItem value="sleeping">Sleeping</MenuItem>
                </Select>
              </FormControl>
            )}
            {proposalType !== "sleeping" && (
              <TextField
                label="Title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
                fullWidth
                size="small"
                placeholder="Untitled Proposal"
              />
            )}
            <TextField
              label="Description (optional)"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
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
            {proposalType === "event" && (
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, color: POLY_GREEN, mb: 1 }}>
                  Event icon (optional)
                </Typography>
                <EventIconPicker value={eventIconKey} onChange={setEventIconKey} />
              </Box>
            )}
          </Stack>

          <Divider sx={{ my: 2 }} />

          {!batchMode && (
            <>
              <SectionHeader
                icon={<GroupsOutlinedIcon fontSize="small" />}
                title="Invitees"
                subtitle={
                  isSoloProposal
                    ? "Solo proposals do not include invitees"
                    : "Tap to cycle: none → required → optional → none"
                }
              />
              {proposalType === "event" && (
                <ToggleButtonGroup
                  exclusive
                  value={soloEvent ? "solo" : "group"}
                  onChange={(_, value) => {
                    if (!value) return;
                    const nextSolo = value === "solo";
                    setSoloEvent(nextSolo);
                    setIntentionalSolo(false);
                    if (nextSolo) setInviteeMode({});
                  }}
                  size="small"
                  sx={{
                    mb: 1.5,
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
              {proposalType === "sleeping" && (
                <ToggleButtonGroup
                  exclusive
                  value={intentionalSolo ? "solo" : "network"}
                  onChange={(_, value) => {
                    if (!value) return;
                    setIntentionalSolo(value === "solo");
                    if (value === "solo") setInviteeMode({});
                  }}
                  size="small"
                  sx={{
                    mb: 1.5,
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
              )}
              {!isSoloProposal && (
                <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mb: 2 }}>
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
              <Divider sx={{ my: 2 }} />
            </>
          )}

          <SectionHeader
            icon={<AccessTimeIcon fontSize="small" />}
            title={
              batchMode
                ? "Batch nights"
                : isPoll
                  ? "Poll time slots"
                  : proposalType === "sleeping"
                    ? "Dates"
                    : "Time window"
            }
            subtitle={
              batchMode
                ? "Up to 14 nights in one batch sleeping proposal"
                : isPoll
                  ? "Add up to 5 options for invitees to choose from"
                  : proposalType === "sleeping"
                    ? "Which night(s) — dates only, no times"
                    : "When does this proposal happen?"
            }
          />
          <Stack spacing={1.5} sx={{ mb: 2 }}>
            {!batchMode && (
              <>
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
                {proposalType === "event" && (
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={allDay}
                        onChange={(event) => {
                          const nextAllDay = event.target.checked;
                          setAllDay(nextAllDay);
                          // Convert existing slot values between date-only and
                          // date-time so the pickers stay valid across the toggle.
                          setSlots((current) =>
                            current.map((slot) => ({
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
                )}
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
                      <ProposalScheduleField
                        label={
                          proposalType === "sleeping"
                            ? "Night of"
                            : allDay
                              ? "Day"
                              : "Start"
                        }
                        mode={
                          proposalType === "sleeping" || allDay ? "date" : "datetime"
                        }
                        value={slot.startAt}
                        onChange={(next) => {
                          const updated = [...slots];
                          updated[index] = {
                            ...updated[index],
                            startAt: next,
                            endAt: updated[index].endAt || next,
                          };
                          setSlots(updated);
                        }}
                      />
                      <ProposalScheduleField
                        label={
                          proposalType === "sleeping"
                            ? "Through (optional)"
                            : allDay
                              ? "End day (optional)"
                              : "End (optional)"
                        }
                        mode={
                          proposalType === "sleeping" || allDay ? "date" : "datetime"
                        }
                        value={slot.endAt}
                        disabled={!slot.startAt}
                        onChange={(next) => {
                          const updated = [...slots];
                          updated[index] = { ...updated[index], endAt: next };
                          setSlots(updated);
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
                    onClick={() => setSlots([...slots, { startAt: "", endAt: "", label: "" }])}
                  >
                    Add poll option
                  </Button>
                )}
              </>
            )}
            {proposalType === "sleeping" && (
              <FormControlLabel
                control={
                  <Checkbox
                    checked={batchMode}
                    onChange={(event) => setBatchMode(event.target.checked)}
                    sx={{ color: POLY_GREEN, "&.Mui-checked": { color: POLY_GREEN } }}
                  />
                }
                label="Batch (multiple nights in one proposal)"
              />
            )}
            {batchMode && proposalType === "sleeping" && (
              <>
                <Typography variant="body2" color="text.secondary">
                  Configure up to 14 nights. Empty nights are skipped. Selected partners are
                  required invitees — submit follows the normal approval path.
                </Typography>
                <FastSleepingPlanGrid
                  rows={fastPlanRows}
                  onChange={setFastPlanRows}
                  partnerPeople={sleepingCandidates}
                  locationOptions={batchLocationOptions}
                  disabled={pending}
                />
                {configuredBatchEntries.length > 0 && (
                  <Box sx={{ mt: 2, p: 1.5, bgcolor: POLY_GREEN_LIGHT, borderRadius: 1 }}>
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

          {!batchMode && (
            <>
              <Divider sx={{ my: 2 }} />

              <SectionHeader
                icon={<LocationOnOutlinedIcon fontSize="small" />}
                title="Location"
                subtitle="Your places, sleeping partners' places, custom text, or leave blank"
              />
              <FormControl fullWidth size="small" sx={{ mb: 1 }}>
                <InputLabel id="proposal-location-label">Location (optional)</InputLabel>
                <Select
                  labelId="proposal-location-label"
                  label="Location (optional)"
                  value={locationId}
                  onChange={(event) => {
                    const value = event.target.value;
                    setLocationId(value);
                    if (value) setLocationCustom("");
                    if (!value) setBedroomIndex("");
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
                  setLocationCustom(event.target.value);
                  if (event.target.value) {
                    setLocationId("");
                    setBedroomIndex("");
                  }
                }}
                fullWidth
                size="small"
                placeholder="Type a location not in the list"
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
            </>
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

          {proposalType === "event" && (
            <Stack spacing={1.5} sx={{ mb: 2 }}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={reminderEnabled}
                    onChange={(event) => setReminderEnabled(event.target.checked)}
                  />
                }
                label="Reminder before event"
              />
              {reminderEnabled && (
                <Stack direction="row" spacing={1} alignItems="center">
                  <TextField
                    label="Amount"
                    type="number"
                    size="small"
                    value={reminderValue}
                    onChange={(event) =>
                      setReminderValue(Math.max(1, Number(event.target.value) || 1))
                    }
                    inputProps={{ min: 1 }}
                    sx={{ width: 100 }}
                  />
                  <FormControl size="small" sx={{ minWidth: 120 }}>
                    <InputLabel id="reminder-unit-label">Unit</InputLabel>
                    <Select
                      labelId="reminder-unit-label"
                      label="Unit"
                      value={reminderUnit}
                      onChange={(event) =>
                        setReminderUnit(event.target.value as "days" | "hours" | "minutes")
                      }
                    >
                      <MenuItem value="days">Days</MenuItem>
                      <MenuItem value="hours">Hours</MenuItem>
                      <MenuItem value="minutes">Minutes</MenuItem>
                    </Select>
                  </FormControl>
                  <Typography variant="caption" color="text.secondary">
                    before start
                  </Typography>
                </Stack>
              )}
            </Stack>
          )}

        </CardContent>

        <CardActions sx={{ px: 2, pb: 2, pt: 0, justifyContent: "flex-end", gap: 1, flexShrink: 0 }}>
          {isEdit && (
            <Button color="error" onClick={handleDelete} disabled={pending} sx={{ mr: "auto" }}>
              Delete
            </Button>
          )}
          <Button onClick={handleClose} color="inherit">
            Exit
          </Button>
          <Button
            variant="contained"
            disabled={!draftReady || pending}
            onClick={handleSave}
            sx={primaryButtonSx}
          >
            Save
          </Button>
          <Button
            variant="contained"
            disabled={!draftReady || pending}
            onClick={() => handleSubmit()}
            sx={primaryButtonSx}
          >
            Submit
          </Button>
        </CardActions>
      </Card>
    </Dialog>

    <Dialog
      open={conflictDialogOpen}
      onClose={() => setConflictDialogOpen(false)}
      fullWidth
      maxWidth="xs"
      aria-labelledby="draft-conflict-dialog-title"
    >
      <DialogTitle id="draft-conflict-dialog-title">Schedule conflicts detected</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          This proposal overlaps with existing calendar items. Review the conflicts below, then
          confirm if you still want to submit.
        </Typography>
        <Alert severity="warning">
          <ConflictWarningList warnings={conflictWarnings} />
        </Alert>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={() => setConflictDialogOpen(false)} color="inherit">
          Review draft
        </Button>
        <Button
          variant="contained"
          onClick={() => {
            setConflictDialogOpen(false);
            handleSubmit(true);
          }}
          disabled={pending}
          sx={primaryButtonSx}
        >
          Submit anyway
        </Button>
      </DialogActions>
    </Dialog>
    </>
  );
}
