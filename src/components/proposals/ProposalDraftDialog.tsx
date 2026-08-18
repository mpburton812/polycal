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
  TextField,
  ToggleButton,
  ToggleButtonGroup,
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
import {
  getDraftComposerSettingsAction,
  type DraftComposerSettings,
} from "@/actions/network-settings";
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
import {
  flagsFromTimingMode,
  ProposalDraftScheduleModeGrid,
  timingModeFromFlags,
} from "./ProposalDraftScheduleModeGrid";
import { ProposalDraftSleepingFields } from "./ProposalDraftSleepingFields";
import {
  POLY_GREEN,
  formatTimeRange,
  isPastSchedule,
  outlinedButtonSx,
  primaryButtonSx,
  proposalCardSx,
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
  toLocalDateInput,
  toLocalInput,
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
  /** Prefills the first slot start when creating from the calendar (PC-165). */
  initialStartAt?: string | null;
  /** Network composer flags; loaded on open when omitted (PC-423–425). */
  composerSettings?: DraftComposerSettings;
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
  initialStartAt = null,
  composerSettings,
}: ProposalDraftDialogProps) {
  const router = useRouter();
  const [savedDraftId, setSavedDraftId] = useState<string | null>(null);
  const isEdit = Boolean(initialDetail || savedDraftId);
  const proposerName =
    people.find((p) => p.id === currentUserId)?.displayName ?? "You";

  const toDraftableType = (type: string): "event" | "sleeping" =>
    type === "event" ? "event" : "sleeping";

  const [proposalType, setProposalType] = useState<"event" | "sleeping">("event");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [locationId, setLocationId] = useState("");
  const [locationCustom, setLocationCustom] = useState("");
  const [bedroomIndex, setBedroomIndex] = useState<number | "">("");
  const [intentionalSolo, setIntentionalSolo] = useState(false);
  const [soloEvent, setSoloEvent] = useState(false);
  const [inviteeChoice, setInviteeChoice] = useState<"unset" | "group" | "solo" | "network">(
    "unset",
  );
  const [timingMode, setTimingMode] = useState<"window" | "allDay" | "poll" | null>(null);
  const [postingKind, setPostingKind] = useState<"proposal" | "booking" | null>(null);
  const [typePicked, setTypePicked] = useState(false);
  const typeSnapshotRef = useRef<{
    event?: { postingKind: "proposal" | "booking" | null; timingMode: "window" | "allDay" | "poll" | null; inviteeChoice: "unset" | "group" | "solo" | "network"; slots: SlotDraft[]; locationId: string; locationCustom: string };
    sleeping?: { postingKind: "proposal" | "booking" | null; inviteeChoice: "unset" | "group" | "solo" | "network"; slots: SlotDraft[]; locationId: string; locationCustom: string; batchMode: boolean };
  }>({});
  const [onBehalfOfUserId, setOnBehalfOfUserId] = useState("");
  const [composer, setComposer] = useState<DraftComposerSettings>(
    composerSettings ?? {
      pollEnabled: true,
      schedulingPosting: "proposals_only",
      proxySchedulingEnabled: false,
      proxySchedulingScope: "sleeping_partners",
    },
  );
  const [isPoll, setIsPoll] = useState(false);
  const [allDay, setAllDay] = useState(false);
  const [batchMode, setBatchMode] = useState(false);
  const [fastPlanRows, setFastPlanRows] = useState<FastSleepingRow[]>(() => buildEmptyGridRows());
  const [batchLocationOptions, setBatchLocationOptions] = useState<ProposalPlaceOption[]>([]);
  const [acceptedPartnerIds, setAcceptedPartnerIds] = useState<string[]>([]);
  const [sleepingLocationOptions, setSleepingLocationOptions] = useState<ProposalPlaceOption[]>(
    [],
  );
  const [eventIconKey, setEventIconKey] = useState<EventIconKey | null>(null);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrencePattern, setRecurrencePattern] = useState<
    "daily" | "weekly" | "monthly" | "yearly"
  >("weekly");
  const [recurrenceCount, setRecurrenceCount] = useState(4);
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderValue, setReminderValue] = useState(1);
  const [reminderUnit, setReminderUnit] = useState<"days" | "hours" | "minutes">("hours");
  const [postToFeed, setPostToFeed] = useState(false);
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
    inviteeChoice === "solo" ||
    (proposalType === "sleeping" ? intentionalSolo : soloEvent);

  const dualPosting = composer.schedulingPosting === "proposals_and_bookings";
  const effectivePostingKind =
    dualPosting ? postingKind : "proposal";
  const hidePoll = !composer.pollEnabled || effectivePostingKind === "booking";
  const showPostingChoice = typePicked && dualPosting;
  const postingChosen = !dualPosting || postingKind !== null;
  const showScheduleType =
    typePicked &&
    postingChosen &&
    proposalType === "event";
  const showProxySelect =
    typePicked &&
    dualPosting &&
    postingKind === "booking";
  const showTypeBody = typePicked && postingChosen;
  const proxyPeople = useMemo(() => {
    const others = people.filter(
      (person) => person.id !== currentUserId && person.status === "active",
    );
    if (composer.proxySchedulingScope === "sleeping_partners") {
      return others.filter((person) => acceptedPartnerIds.includes(person.id));
    }
    return others;
  }, [people, currentUserId, composer.proxySchedulingScope, acceptedPartnerIds]);

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

  // Preview bounds must use the SAME helpers as the persist path so the schedule
  // label a user sees before saving matches what is stored (PC-317): sleeping /
  // batch nights are midnight-in-TZ via sleepingDateToStartIso (viewer TZ when a
  // stored value later resolves it), while all-day events keep noon-UTC bounds.
  const previewStartIso = useMemo(() => {
    if (batchMode && configuredBatchEntries.length > 0) {
      const sorted = [...configuredBatchEntries]
        .map((entry) => sleepingDateToStartIso(entry.nightDate.slice(0, 10)))
        .filter((iso): iso is string => Boolean(iso))
        .sort((a, b) => a.localeCompare(b));
      return sorted[0];
    }
    const first = slots.find((s) => s.startAt);
    if (!first) return undefined;
    if (proposalType === "sleeping") return sleepingDateToStartIso(first.startAt);
    return allDay ? localDateToStartIso(first.startAt) : localInputToIso(first.startAt);
  }, [batchMode, configuredBatchEntries, slots, proposalType, allDay]);

  const previewEndIso = useMemo(() => {
    if (batchMode && configuredBatchEntries.length > 0) {
      const sorted = [...configuredBatchEntries]
        .map((entry) => sleepingDateToStartIso(entry.nightDate.slice(0, 10)))
        .filter((iso): iso is string => Boolean(iso))
        .sort((a, b) => a.localeCompare(b));
      return sorted[sorted.length - 1];
    }
    const first = slots.find((s) => s.startAt);
    if (!first) return undefined;
    if (proposalType === "sleeping") {
      return sleepingDateToStartIso(first.endAt || first.startAt);
    }
    if (allDay) {
      return first.endAt ? localDateToEndIso(first.endAt) : localDateToEndIso(first.startAt);
    }
    return first.endAt ? localInputToIso(first.endAt) : undefined;
  }, [batchMode, configuredBatchEntries, slots, proposalType, allDay]);

  useEffect(() => {
    if (!open) return;
    void listAcceptedSleepingPartnerIdsAction().then(setAcceptedPartnerIds);
    if (composerSettings) {
      setComposer(composerSettings);
      return;
    }
    void getDraftComposerSettingsAction().then(setComposer);
  }, [open, composerSettings]);

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
  const showPastWarning = isPastSchedule(previewStartIso, proposalType);

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
      setProposalType(toDraftableType(initialDetail.proposalType));
      setTypePicked(true);
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
      setInviteeChoice(
        initialDetail.intentionalSolo
          ? "solo"
          : initialDetail.proposalType === "sleeping"
            ? "network"
            : "group",
      );
      setIsPoll(initialDetail.isPoll);
      setAllDay(initialDetail.proposalType === "event" && initialDetail.isAllDay);
      setTimingMode(
        initialDetail.proposalType === "event"
          ? timingModeFromFlags({
              allDay: initialDetail.isAllDay,
              isPoll: initialDetail.isPoll,
            })
          : null,
      );
      setPostingKind(initialDetail.postingKind === "booking" ? "booking" : "proposal");
      setOnBehalfOfUserId(initialDetail.onBehalfOfUserId ?? "");
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
                toDraftableType(initialDetail.proposalType),
                initialDetail.isAllDay,
              ),
              endAt: slot.endAt
                ? slotStartInput(
                    slot.endAt,
                    toDraftableType(initialDetail.proposalType),
                    initialDetail.isAllDay,
                  )
                : "",
              label: slot.label ?? "",
            }))
          : [{ startAt: "", endAt: "", label: "" }],
      );
    const modes: Record<string, InviteeSelection> = {};
    for (const invitee of initialDetail.invitees) {
      if (invitee.role === "required" || invitee.role === "optional") {
        modes[invitee.userId] = invitee.role;
      }
    }
      setInviteeMode(modes);
      const reminder = minutesToReminderDisplay(initialDetail.reminderOffsetMinutes);
      setReminderEnabled(reminder.enabled);
      setReminderValue(reminder.value);
      setReminderUnit(reminder.unit);
      setPostToFeed(Boolean(initialDetail.postToFeed));
    } else if (!savedDraftId) {
      setProposalType(lockedProposalType ?? "event");
      setTypePicked(Boolean(lockedProposalType));
      typeSnapshotRef.current = {};
      setTitle("");
      setDescription("");
      setNotes("");
      setLocationId("");
      setLocationCustom("");
      setBedroomIndex("");
      setIntentionalSolo(false);
      setSoloEvent(false);
      setInviteeChoice("unset");
      setSavedDraftId(null);
      setIsPoll(false);
      setAllDay(false);
      setPostingKind(null);
      setOnBehalfOfUserId("");
      setBatchMode(false);
      setFastPlanRows(buildEmptyGridRows());
      setBatchLocationOptions([]);
      setIsRecurring(false);
      setRecurrencePattern("weekly");
      setRecurrenceCount(4);
      const type = lockedProposalType ?? "event";
      const startInput =
        initialStartAt != null && initialStartAt.length > 0
          ? type === "sleeping"
            ? toLocalDateInput(initialStartAt)
            : toLocalInput(initialStartAt)
          : "";
      // Day-sheet create already chose a day — show When with Window so the prefill is visible (PC-418).
      setTimingMode(type === "event" && startInput ? "window" : null);
      setSlots([{ startAt: startInput, endAt: "", label: "" }]);
      setInviteeMode({});
      setReminderEnabled(false);
      setReminderValue(1);
      setReminderUnit("hours");
      setPostToFeed(false);
    }
  }, [open, initialDetail, lockedProposalType, savedDraftId, initialStartAt]);

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
    setProposalType(toDraftableType(detail.proposalType));
    setTypePicked(true);
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
    setInviteeChoice(
      detail.intentionalSolo
        ? "solo"
        : detail.proposalType === "sleeping"
          ? "network"
          : "group",
    );
    setIsPoll(detail.isPoll);
    setAllDay(detail.proposalType === "event" && detail.isAllDay);
    setTimingMode(
      detail.proposalType === "event"
        ? timingModeFromFlags({ allDay: detail.isAllDay, isPoll: detail.isPoll })
        : null,
    );
    setPostingKind(detail.postingKind === "booking" ? "booking" : "proposal");
    setOnBehalfOfUserId(detail.onBehalfOfUserId ?? "");
    setEventIconKey(isEventIconKey(detail.eventIconKey) ? detail.eventIconKey : null);
    setIsRecurring(detail.isRecurrenceParent);
    if (detail.recurrenceRule) {
      setRecurrencePattern(detail.recurrenceRule.pattern);
      setRecurrenceCount(detail.recurrenceRule.count);
    }
    setSlots(
      detail.timeSlots.length > 0
        ? detail.timeSlots.map((slot) => ({
            startAt: slotStartInput(slot.startAt, toDraftableType(detail.proposalType), detail.isAllDay),
            endAt: slot.endAt
              ? slotStartInput(slot.endAt, toDraftableType(detail.proposalType), detail.isAllDay)
              : "",
            label: slot.label ?? "",
          }))
        : [{ startAt: "", endAt: "", label: "" }],
    );
    const modes: Record<string, InviteeSelection> = {};
    for (const invitee of detail.invitees) {
      if (invitee.role === "required" || invitee.role === "optional") {
        modes[invitee.userId] = invitee.role;
      }
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
              // All-day event: slot inputs are calendar dates stored as noon-UTC
              // civil bounds (same local day in every US TZ) — NOT the midnight-TZ
              // bounds sleeping uses (PC-258 / PC-301 / PC-317).
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
        title.trim()
          ? title
          : proposalType === "sleeping"
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
      postingKind:
        effectivePostingKind === "booking"
          ? ("booking" as const)
          : ("proposal" as const),
      onBehalfOfUserId:
        effectivePostingKind === "booking" && onBehalfOfUserId
          ? onBehalfOfUserId
          : null,
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
      postToFeed,
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

  const datesReady =
    proposalType === "sleeping"
      ? batchMode
        ? configuredBatchEntries.length > 0
        : Boolean(slots[0]?.startAt)
      : timingMode !== null && Boolean(slots[0]?.startAt);
  const inviteesReady =
    batchMode ||
    inviteeChoice === "solo" ||
    inviteeChoice === "network" ||
    (inviteeChoice === "group" &&
      Object.values(inviteeMode).some((role) => role === "required" || role === "optional"));
  const submitReady =
    Boolean(title.trim()) &&
    typePicked &&
    postingChosen &&
    datesReady &&
    inviteesReady;

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
                {isEdit ? "Edit draft" : "New Event"}
              </Typography>
              <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" sx={{ mt: 0.5 }}>
                {batchMode && <Chip label="Batch" size="small" variant="outlined" />}
                {isPoll && (
                  <Chip
                    icon={<PollOutlinedIcon sx={{ fontSize: "14px !important" }} />}
                    label="Poll"
                    size="small"
                    variant="outlined"
                  />
                )}
                {effectivePostingKind === "booking" && (
                  <Chip label="Booking" size="small" variant="outlined" />
                )}
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

          <TextField
            label="Title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            fullWidth
            size="small"
            placeholder="Untitled event"
            sx={{ mb: 2 }}
          />

          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, color: POLY_GREEN, mb: 1 }}>
              Social or Sleeping
            </Typography>
            <ToggleButtonGroup
              exclusive
              value={typePicked ? proposalType : null}
              onChange={(_, value) => {
                if (!value) {
                  if (proposalType === "event") {
                    typeSnapshotRef.current.event = {
                      postingKind,
                      timingMode,
                      inviteeChoice,
                      slots,
                      locationId,
                      locationCustom,
                    };
                  } else {
                    typeSnapshotRef.current.sleeping = {
                      postingKind,
                      inviteeChoice,
                      slots,
                      locationId,
                      locationCustom,
                      batchMode,
                    };
                  }
                  setTypePicked(false);
                  return;
                }
                const nextType = value as "event" | "sleeping";
                if (typePicked && nextType !== proposalType) {
                  if (proposalType === "event") {
                    typeSnapshotRef.current.event = {
                      postingKind,
                      timingMode,
                      inviteeChoice,
                      slots,
                      locationId,
                      locationCustom,
                    };
                  } else {
                    typeSnapshotRef.current.sleeping = {
                      postingKind,
                      inviteeChoice,
                      slots,
                      locationId,
                      locationCustom,
                      batchMode,
                    };
                  }
                  const snap =
                    nextType === "event"
                      ? typeSnapshotRef.current.event
                      : typeSnapshotRef.current.sleeping;
                  if (snap) {
                    setPostingKind(snap.postingKind);
                    setInviteeChoice(snap.inviteeChoice);
                    setSlots(snap.slots);
                    setLocationId(snap.locationId);
                    setLocationCustom(snap.locationCustom);
                    if (nextType === "event" && "timingMode" in snap) {
                      setTimingMode(snap.timingMode);
                    }
                    if (nextType === "sleeping" && "batchMode" in snap) {
                      setBatchMode(snap.batchMode);
                    }
                  } else {
                    setPostingKind(null);
                    setTimingMode(null);
                    setInviteeChoice("unset");
                    setInviteeMode({});
                    setSlots([{ startAt: "", endAt: "", label: "" }]);
                    setLocationId("");
                    setLocationCustom("");
                    setBatchMode(false);
                    setIsPoll(false);
                    setAllDay(false);
                  }
                } else if (!typePicked) {
                  const snap =
                    nextType === "event"
                      ? typeSnapshotRef.current.event
                      : typeSnapshotRef.current.sleeping;
                  if (snap) {
                    setPostingKind(snap.postingKind);
                    setInviteeChoice(snap.inviteeChoice);
                    setSlots(snap.slots);
                    setLocationId(snap.locationId);
                    setLocationCustom(snap.locationCustom);
                    if (nextType === "event" && "timingMode" in snap) {
                      setTimingMode(snap.timingMode);
                      if (snap.timingMode) {
                        const flags = flagsFromTimingMode(snap.timingMode);
                        setAllDay(flags.allDay);
                        setIsPoll(flags.isPoll);
                      }
                    }
                    if (nextType === "sleeping" && "batchMode" in snap) {
                      setBatchMode(snap.batchMode);
                    }
                  }
                }
                setProposalType(nextType);
                setTypePicked(true);
                if (nextType === "event") {
                  setIntentionalSolo(false);
                } else {
                  setSoloEvent(false);
                  setIsPoll(false);
                }
              }}
              size="small"
              sx={{
                "& .MuiToggleButton-root.Mui-selected": {
                  bgcolor: POLY_GREEN,
                  color: "#fff",
                },
              }}
            >
              <ToggleButton value="event">Social</ToggleButton>
              <ToggleButton value="sleeping">Sleeping</ToggleButton>
            </ToggleButtonGroup>
          </Box>

          {showPostingChoice ? (
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, color: POLY_GREEN, mb: 1 }}>
                Posting
              </Typography>
              <ToggleButtonGroup
                exclusive
                value={postingKind}
                onChange={(_, value) => {
                  if (!value) {
                    setPostingKind(null);
                    return;
                  }
                  const next = value as "proposal" | "booking";
                  if (postingKind && next !== postingKind) {
                    setTimingMode(null);
                    setInviteeChoice("unset");
                    setInviteeMode({});
                    setSlots([{ startAt: "", endAt: "", label: "" }]);
                    setLocationId("");
                    setLocationCustom("");
                    setIsPoll(false);
                    setAllDay(false);
                  }
                  setPostingKind(next);
                  if (next === "booking") {
                    setIsPoll(false);
                  }
                }}
                size="small"
                sx={{
                  "& .MuiToggleButton-root.Mui-selected": {
                    bgcolor: POLY_GREEN,
                    color: "#fff",
                  },
                }}
              >
                <ToggleButton value="proposal">Proposal</ToggleButton>
                <ToggleButton value="booking">Booking</ToggleButton>
              </ToggleButtonGroup>
            </Box>
          ) : null}

          {showProxySelect ? (
            <FormControl fullWidth size="small" sx={{ mb: 2 }}>
            <InputLabel id="proxy-on-behalf-label">Booking for</InputLabel>
            <Select
              labelId="proxy-on-behalf-label"
              label="Booking for"
                value={onBehalfOfUserId}
                onChange={(event) => setOnBehalfOfUserId(String(event.target.value))}
              >
                <MenuItem value="">Myself</MenuItem>
                {proxyPeople.map((person) => (
                  <MenuItem key={person.id} value={person.id}>
                    {person.displayName}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          ) : null}

          {showScheduleType && (
            <ProposalDraftScheduleModeGrid
              timingMode={timingMode}
              isRecurring={isRecurring}
              hidePoll={hidePoll}
              disableRecurring={false}
              onTimingModeChange={(mode) => {
                setTimingMode(mode);
                const flags = flagsFromTimingMode(mode);
                setAllDay(flags.allDay);
                setIsPoll(flags.isPoll);
                if (flags.isPoll) setIsRecurring(false);
                setSlots((current) =>
                  current.map((slot) => ({
                    ...slot,
                    startAt: slot.startAt
                      ? flags.allDay
                        ? slot.startAt.slice(0, 10)
                        : slot.startAt.includes("T")
                          ? slot.startAt
                          : `${slot.startAt.slice(0, 10)}T09:00`
                      : "",
                    endAt: slot.endAt
                      ? flags.allDay
                        ? slot.endAt.slice(0, 10)
                        : slot.endAt.includes("T")
                          ? slot.endAt
                          : `${slot.endAt.slice(0, 10)}T10:00`
                      : "",
                  })),
                );
              }}
              onRecurringChange={setIsRecurring}
            />
          )}

          {showTypeBody && proposalType === "event" && (
            <ProposalDraftEventFields
              title={title}
              onTitleChange={setTitle}
              allDay={allDay}
              slots={slots}
              onSlotsChange={setSlots}
              isPoll={isPoll}
              applyEventStartChange={applyEventStartChange}
              isSoloProposal={isSoloProposal}
              inviteeChoice={inviteeChoice === "network" ? "unset" : inviteeChoice}
              onInviteeChoiceChange={(choice) => {
                setInviteeChoice(choice);
                setSoloEvent(choice === "solo");
                setIntentionalSolo(false);
                if (choice === "solo") setInviteeMode({});
              }}
              hideInviteeRoles={effectivePostingKind === "booking"}
              hideTitle
              showWhenFields={timingMode !== null}
              showInvitees={timingMode !== null}
              showLocation={
                inviteeChoice === "solo" ||
                (inviteeChoice === "group" &&
                  Object.values(inviteeMode).some((role) => role === "required" || role === "optional"))
              }
              candidates={candidates}
              inviteeMode={inviteeMode}
              setInviteeRole={setInviteeRole}
              locationId={locationId}
              locationCustom={locationCustom}
              locationOptions={locationOptions}
              onLocationIdChange={setLocationId}
              onLocationCustomChange={setLocationCustom}
              onClearBedroom={() => setBedroomIndex("")}
              isRecurring={!batchMode && isRecurring}
              recurrencePattern={recurrencePattern}
              onRecurrencePatternChange={setRecurrencePattern}
              recurrenceCount={recurrenceCount}
              onRecurrenceCountChange={setRecurrenceCount}
            />
          )}

          {showTypeBody && proposalType === "sleeping" && (
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
              inviteeChoice={inviteeChoice === "group" ? "unset" : inviteeChoice}
              onInviteeChoiceChange={(choice) => {
                setInviteeChoice(choice);
                setIntentionalSolo(choice === "solo");
                if (choice === "solo" || choice === "unset") setInviteeMode({});
              }}
              hideInviteeRoles={effectivePostingKind === "booking"}
              showLocation={
                inviteeChoice === "solo" ||
                (inviteeChoice === "network" &&
                  Object.values(inviteeMode).some(
                    (role) => role === "required" || role === "optional",
                  ))
              }
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

          {showTypeBody &&
          (batchMode ||
            inviteeChoice === "solo" ||
            (inviteeChoice === "group" &&
              Object.values(inviteeMode).some(
                (role) => role === "required" || role === "optional",
              )) ||
            inviteeChoice === "network") ? (
          <ProposalDraftMoreOptions
            proposalType={proposalType}
            description={description}
            onDescriptionChange={setDescription}
            notes={notes}
            onNotesChange={setNotes}
            eventIconKey={eventIconKey}
            onEventIconKeyChange={setEventIconKey}
            reminderEnabled={reminderEnabled}
            onReminderEnabledChange={setReminderEnabled}
            reminderValue={reminderValue}
            onReminderValueChange={setReminderValue}
            reminderUnit={reminderUnit}
            onReminderUnitChange={setReminderUnit}
            postToFeed={postToFeed}
            onPostToFeedChange={setPostToFeed}
          />
          ) : null}
        </CardContent>

        <CardActions sx={{ px: 2, pb: 2, pt: 0, justifyContent: "flex-end", gap: 1, flexShrink: 0 }}>
          {isEdit && (
            <Button
              color="error"
              variant="outlined"
              onClick={handleDelete}
              disabled={pending}
              sx={{ ...outlinedButtonSx, mr: "auto" }}
            >
              Delete
            </Button>
          )}
          <Button variant="outlined" onClick={handleClose} sx={outlinedButtonSx}>
            Exit
          </Button>
          <Button
            variant="contained"
            disabled={!submitReady || pending}
            onClick={() => handleSubmit()}
            sx={primaryButtonSx}
          >
            {effectivePostingKind === "booking" ? "Add to calendar" : "Submit"}
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
