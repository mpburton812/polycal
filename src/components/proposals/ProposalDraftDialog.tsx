"use client";

import PollOutlinedIcon from "@mui/icons-material/PollOutlined";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import {
  Alert,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  Chip,
  Dialog,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Typography,
} from "@mui/material";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import dayjs from "dayjs";

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

import {
  ConflictWarningList,
  ProposalConflictConfirmDialog,
} from "./ProposalConflictConfirmDialog";
import { ProposalDraftEventFields } from "./ProposalDraftEventFields";
import { ProposalDraftMoreOptions } from "./ProposalDraftMoreOptions";
import { ProposalDraftSleepingFields } from "./ProposalDraftSleepingFields";
import {
  POLY_GREEN,
  formatTimeRange,
  isPastSchedule,
  outlinedButtonSx,
  primaryButtonSx,
  proposalCardSx,
  typeBadgeLabel,
  typeChipSxForProposal,
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
import { isEventIconKey, type EventIconKey } from "@/lib/event-icons/registry";
import {
  localDateToEndIso,
  localDateToStartIso,
  localInputToIso,
  slotStartInput,
  type InviteeSelection,
  type SlotDraft,
} from "./proposalDraftDateUtils";

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

  function setInviteeRole(personId: string, role: InviteeSelection) {
    setInviteeMode((current) => ({ ...current, [personId]: role }));
  }

  /** Defaults event end to start + 1 hour when end is empty or still matching the previous start (PC-125). */
  function applyEventStartChange(index: number, nextStart: string) {
    setSlots((current) => {
      const updated = [...current];
      const previous = updated[index];
      let nextEnd = previous.endAt;
      if (nextStart && !allDay) {
        const autoEnd = dayjs(nextStart).add(1, "hour").format("YYYY-MM-DDTHH:mm");
        if (
          !previous.endAt ||
          previous.endAt === previous.startAt ||
          (previous.startAt &&
            previous.endAt === dayjs(previous.startAt).add(1, "hour").format("YYYY-MM-DDTHH:mm"))
        ) {
          nextEnd = autoEnd;
        }
      } else if (nextStart && !previous.endAt) {
        nextEnd = nextStart;
      }
      updated[index] = { ...previous, startAt: nextStart, endAt: nextEnd };
      return updated;
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
          <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ mb: 1.5 }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="h6" component="h2" sx={{ fontSize: "1.1rem", fontWeight: 600 }}>
                {isEdit ? "Edit draft" : "New proposal"}
              </Typography>
              <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" sx={{ mt: 0.5 }}>
                <Chip
                  label={typeBadgeLabel(proposalType)}
                  size="small"
                  sx={{
                    ...typeChipSxForProposal(proposalType),
                    height: 20,
                    fontSize: "0.6rem",
                  }}
                />
                <Chip label="DRAFT" size="small" variant="outlined" sx={{ fontWeight: 600, fontSize: "0.65rem" }} />
                {batchMode && <Chip label="Batch" size="small" variant="outlined" />}
                {isPoll && (
                  <Chip
                    icon={<PollOutlinedIcon sx={{ fontSize: "14px !important" }} />}
                    label="Poll"
                    size="small"
                    variant="outlined"
                  />
                )}
                <Typography variant="caption" color="text.secondary">
                  by {proposerName}
                </Typography>
              </Stack>
            </Box>
          </Stack>

          {(timePreview || locationName || (proposalType === "sleeping" && bedroomIndex !== "")) && (
            <Typography variant="body2" sx={{ mb: 1.5, color: POLY_GREEN, fontWeight: 500 }}>
              {[
                timePreview,
                locationName,
                proposalType === "sleeping" && bedroomIndex !== ""
                  ? bedroomOptions.find((b) => b.index === bedroomIndex)?.label
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </Typography>
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

          {!lockedProposalType && (
            <FormControl fullWidth size="small" sx={{ mb: 2 }}>
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
                    setBatchMode(false);
                  } else {
                    setSoloEvent(false);
                    setIsPoll(false);
                  }
                }}
              >
                <MenuItem value="event">Event</MenuItem>
                <MenuItem value="sleeping">Sleeping</MenuItem>
              </Select>
            </FormControl>
          )}

          {proposalType === "event" && (
            <ProposalDraftEventFields
              title={title}
              onTitleChange={setTitle}
              allDay={allDay}
              onAllDayChange={setAllDay}
              slots={slots}
              onSlotsChange={setSlots}
              isPoll={isPoll}
              applyEventStartChange={applyEventStartChange}
              isSoloProposal={isSoloProposal}
              soloEvent={soloEvent}
              onSoloEventChange={(nextSolo) => {
                setSoloEvent(nextSolo);
                setIntentionalSolo(false);
                if (nextSolo) setInviteeMode({});
              }}
              candidates={candidates}
              inviteeMode={inviteeMode}
              setInviteeRole={setInviteeRole}
              locationId={locationId}
              locationCustom={locationCustom}
              locationOptions={locationOptions}
              onLocationIdChange={setLocationId}
              onLocationCustomChange={setLocationCustom}
              onClearBedroom={() => setBedroomIndex("")}
            />
          )}

          {proposalType === "sleeping" && (
            <ProposalDraftSleepingFields
              batchMode={batchMode}
              onBatchModeChange={setBatchMode}
              fastPlanRows={fastPlanRows}
              onFastPlanRowsChange={setFastPlanRows}
              sleepingCandidates={sleepingCandidates}
              batchLocationOptions={batchLocationOptions}
              configuredBatchEntries={configuredBatchEntries}
              people={people}
              locationOptions={locationOptions}
              pending={pending}
              intentionalSolo={intentionalSolo}
              onIntentionalSoloChange={(solo) => {
                setIntentionalSolo(solo);
                if (solo) setInviteeMode({});
              }}
              isSoloProposal={isSoloProposal}
              candidates={candidates}
              inviteeMode={inviteeMode}
              setInviteeRole={setInviteeRole}
              slots={slots}
              onSlotsChange={setSlots}
              locationId={locationId}
              locationCustom={locationCustom}
              bedroomIndex={bedroomIndex}
              bedroomOptions={bedroomOptions}
              onLocationIdChange={setLocationId}
              onLocationCustomChange={setLocationCustom}
              onBedroomIndexChange={setBedroomIndex}
            />
          )}

          <ProposalDraftMoreOptions
            proposalType={proposalType}
            description={description}
            onDescriptionChange={setDescription}
            eventPrivacy={eventPrivacy}
            onEventPrivacyChange={setEventPrivacy}
            notes={notes}
            onNotesChange={setNotes}
            eventIconKey={eventIconKey}
            onEventIconKeyChange={setEventIconKey}
            isPoll={isPoll}
            onIsPollChange={setIsPoll}
            batchMode={batchMode}
            isRecurring={isRecurring}
            onIsRecurringChange={setIsRecurring}
            recurrencePattern={recurrencePattern}
            onRecurrencePatternChange={setRecurrencePattern}
            recurrenceCount={recurrenceCount}
            onRecurrenceCountChange={setRecurrenceCount}
            reminderEnabled={reminderEnabled}
            onReminderEnabledChange={setReminderEnabled}
            reminderValue={reminderValue}
            onReminderValueChange={setReminderValue}
            reminderUnit={reminderUnit}
            onReminderUnitChange={setReminderUnit}
          />
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
            variant="outlined"
            disabled={!draftReady || pending}
            onClick={handleSave}
            sx={outlinedButtonSx}
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

    <ProposalConflictConfirmDialog
      open={conflictDialogOpen}
      warnings={conflictWarnings}
      pending={pending}
      onClose={() => setConflictDialogOpen(false)}
      onSubmitAnyway={() => {
        setConflictDialogOpen(false);
        handleSubmit(true);
      }}
    />
    </>
  );
}
