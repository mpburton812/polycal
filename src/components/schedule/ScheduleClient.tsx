"use client";

import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import EventNoteIcon from "@mui/icons-material/EventNote";
import {
  Box,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";

import type { ProposalPlaceOption } from "@/actions/proposals";
import {
  listScheduleEventsAction,
  type ScheduleFilterMode,
  type SchedulePayload,
} from "@/actions/schedule";
import type { PersonSummary } from "@/actions/users";
import { PlanningModeDrawer } from "@/components/schedule/PlanningModeDrawer";
import { ScheduleHeatmap } from "@/components/schedule/ScheduleHeatmap";
import { ScheduleMonthView } from "@/components/schedule/ScheduleMonthView";
import { ScheduleWeekView } from "@/components/schedule/ScheduleWeekView";
import {
  loadScheduleViewState,
  saveScheduleViewState,
  type ScheduleCalendarLayout,
  type ScheduleViewState,
} from "@/components/schedule/scheduleViewState";
import { useScheduleTapRouter } from "@/components/schedule/useScheduleTapRouter";
import { filterScheduleEvents } from "@/lib/schedule/filters";
import {
  addDays,
  isSameLocalCalendarDay,
  startOfWeekMonday,
} from "@/lib/schedule/dates";
import { startOfMonth } from "@/lib/schedule/month-grid";
import { computeScheduleFetchRange } from "@/lib/schedule/fetch-range";
import dynamic from "next/dynamic";

/** Heavy dialogs load on demand so the calendar paints sooner (PC-145). */
const ProposalDetailDialog = dynamic(
  () =>
    import("@/components/proposals/ProposalDetailDialog").then((mod) => ({
      default: mod.ProposalDetailDialog,
    })),
  { ssr: false },
);
const ProposalDraftDialog = dynamic(
  () =>
    import("@/components/proposals/ProposalDraftDialog").then((mod) => ({
      default: mod.ProposalDraftDialog,
    })),
  { ssr: false },
);
const SeriesOccurrenceChooserDialog = dynamic(
  () =>
    import("@/components/schedule/SeriesOccurrenceChooserDialog").then((mod) => ({
      default: mod.SeriesOccurrenceChooserDialog,
    })),
  { ssr: false },
);
const SliceDetailDialog = dynamic(
  () =>
    import("@/components/schedule/SliceDetailDialog").then((mod) => ({
      default: mod.SliceDetailDialog,
    })),
  { ssr: false },
);
import { SCHEDULE_SEMANTIC_COLORS } from "@/theme/tokens";

interface ScheduleLegendItemProps {
  label: string;
  fill: string;
  borderStyle?: "solid" | "dashed";
}

/** Semantic fill swatch for the schedule status legend (PC-77). */
function ScheduleLegendItem({ label, fill, borderStyle = "solid" }: ScheduleLegendItemProps) {
  return (
    <Stack direction="row" alignItems="center" spacing={0.5}>
      <Box
        sx={{
          width: 10,
          height: 10,
          bgcolor: fill,
          border: 1,
          borderColor: "divider",
          borderStyle,
          borderRadius: 0.25,
          flexShrink: 0,
        }}
        aria-hidden
      />
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
    </Stack>
  );
}

interface ScheduleClientProps {
  initialPayload: SchedulePayload;
  initialWeekStartIso: string;
  people: PersonSummary[];
  places: ProposalPlaceOption[];
  currentUserId: string;
  acceptedPartnerIds: string[];
  timeZone: string;
}

/**
 * Schedule tab — weekly calendar, filters, planning drawer, and proposal detail (PC-42).
 */
export function ScheduleClient({
  initialPayload,
  initialWeekStartIso,
  people,
  places,
  currentUserId,
  acceptedPartnerIds,
  timeZone,
}: ScheduleClientProps) {
  const pathname = usePathname();
  const previousPathRef = useRef<string | null>(null);
  const initialPayloadHydratedRef = useRef(false);
  const refreshSeqRef = useRef(0);
  const [viewState, setViewState] = useState<ScheduleViewState>(() => ({
    ...loadScheduleViewState(),
    weekStartIso: initialWeekStartIso,
    monthAnchorIso: initialWeekStartIso,
  }));
  const [payload, setPayload] = useState<SchedulePayload>(initialPayload);
  const [pending, startTransition] = useTransition();
  const {
    state: dialogState,
    openScheduleEvent,
    closeDetail,
    closeSlice,
    closeChooser,
    closeDraft,
    handleEditFromDetail,
    openRelatedProposal,
    openDetachedProposal,
  } = useScheduleTapRouter();

  const weekStart = useMemo(
    () => startOfWeekMonday(new Date(viewState.weekStartIso)),
    [viewState.weekStartIso],
  );
  const monthAnchor = useMemo(
    () => startOfMonth(new Date(viewState.monthAnchorIso)),
    [viewState.monthAnchorIso],
  );
  const dayCount = viewState.compact ? 14 : 7;
  const isMonthLayout = viewState.calendarLayout === "month";
  const rangeEnd = useMemo(() => {
    return computeScheduleFetchRange(
      isMonthLayout ? monthAnchor : weekStart,
      isMonthLayout ? "month" : "week",
      viewState.compact,
    ).rangeEnd;
  }, [isMonthLayout, monthAnchor, viewState.compact, weekStart]);

  const rangeStart = useMemo(() => {
    return computeScheduleFetchRange(
      isMonthLayout ? monthAnchor : weekStart,
      isMonthLayout ? "month" : "week",
      viewState.compact,
    ).rangeStart;
  }, [isMonthLayout, monthAnchor, viewState.compact, weekStart]);

  const rangeLabel = useMemo(() => {
    if (isMonthLayout) {
      return monthAnchor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    }
    const end = addDays(weekStart, dayCount - 1);
    const fmt: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
    return `${weekStart.toLocaleDateString(undefined, fmt)} – ${end.toLocaleDateString(undefined, fmt)}`;
  }, [dayCount, isMonthLayout, monthAnchor, weekStart]);

  const refreshSchedule = useCallback(
    (
      anchorDate: Date,
      opts?: { layout?: ScheduleCalendarLayout; compact?: boolean },
    ) => {
      const layout = opts?.layout ?? viewState.calendarLayout;
      const compact = opts?.compact ?? viewState.compact;
      const { rangeStart: start, rangeEnd: end } = computeScheduleFetchRange(
        anchorDate,
        layout,
        compact,
      );

      const seq = ++refreshSeqRef.current;
      startTransition(async () => {
        const result = await listScheduleEventsAction({
          rangeStart: start.toISOString(),
          rangeEnd: end.toISOString(),
        });
        if (seq !== refreshSeqRef.current) return;
        if (result.ok) setPayload(result.payload);
      });
    },
    [viewState.calendarLayout, viewState.compact],
  );

  const refreshCurrentView = useCallback(() => {
    refreshSchedule(isMonthLayout ? monthAnchor : weekStart, {
      layout: viewState.calendarLayout,
      compact: viewState.compact,
    });
  }, [
    isMonthLayout,
    monthAnchor,
    refreshSchedule,
    viewState.calendarLayout,
    viewState.compact,
    weekStart,
  ]);

  useEffect(() => {
    saveScheduleViewState(viewState);
  }, [viewState]);

  useEffect(() => {
    if (!initialPayloadHydratedRef.current) {
      setPayload(initialPayload);
      initialPayloadHydratedRef.current = true;
    }
  }, [initialPayload]);

  /**
   * Opening Schedule (mount or navigation) anchors on the current week (PC-55).
   * Skip the client refetch when server initialPayload already covers this Monday (PC-141).
   */
  useEffect(() => {
    const onSchedule = pathname === "/schedule";
    const enteringSchedule =
      onSchedule &&
      (previousPathRef.current === null || previousPathRef.current !== "/schedule");

    if (enteringSchedule) {
      const monday = startOfWeekMonday(new Date());
      setViewState((current) => ({
        ...current,
        weekStartIso: monday.toISOString(),
        monthAnchorIso: monday.toISOString(),
      }));

      const initialMonday = startOfWeekMonday(new Date(initialWeekStartIso));
      const sameWeek = isSameLocalCalendarDay(monday, initialMonday);

      if (!sameWeek) {
        refreshSchedule(monday, { layout: viewState.calendarLayout });
      }
    }

    previousPathRef.current = pathname;
  }, [
    pathname,
    refreshSchedule,
    viewState.calendarLayout,
    initialWeekStartIso,
  ]);

  const filteredEvents = useMemo(
    () =>
      filterScheduleEvents(
        payload.events,
        viewState.filterMode,
        currentUserId,
        viewState.filterPersonId || undefined,
        acceptedPartnerIds,
      ),
    [
      payload.events,
      viewState.filterMode,
      viewState.filterPersonId,
      currentUserId,
      acceptedPartnerIds,
    ],
  );

  const eventIdsOnCalendar = useMemo(
    () => new Set(filteredEvents.map((event) => event.proposalId)),
    [filteredEvents],
  );

  function shiftPeriod(delta: number) {
    if (isMonthLayout) {
      const next = new Date(monthAnchor);
      next.setMonth(next.getMonth() + delta);
      setViewState((current) => ({ ...current, monthAnchorIso: next.toISOString() }));
      refreshSchedule(next, { layout: "month" });
      return;
    }

    const step = viewState.compact ? 14 : 7;
    const next = addDays(weekStart, delta * step);
    setViewState((current) => ({ ...current, weekStartIso: next.toISOString() }));
    refreshSchedule(next, { layout: "week", compact: viewState.compact });
  }

  function handleMonthDayClick(day: Date) {
    const monday = startOfWeekMonday(day);
    setViewState((current) => ({
      ...current,
      calendarLayout: "week",
      weekStartIso: monday.toISOString(),
      monthAnchorIso: day.toISOString(),
    }));
    refreshSchedule(monday, { layout: "week", compact: viewState.compact });
  }

  return (
    <Box
      sx={{ pb: 2 }}
      data-testid="schedule-ready"
      data-ready={pending ? "false" : "true"}
      data-range-start={rangeStart.toISOString()}
      data-range-end={rangeEnd.toISOString()}
    >
      <Box
        sx={{ display: "none" }}
        data-testid="schedule-range-start"
        data-value={rangeStart.toISOString()}
      />
      <Box
        sx={{ display: "none" }}
        data-testid="schedule-range-end"
        data-value={rangeEnd.toISOString()}
      />
      <Box
        sx={{
          position: "sticky",
          top: 0,
          zIndex: 2,
          bgcolor: "background.default",
          pt: 0.5,
          pb: 1,
          borderBottom: 1,
          borderColor: "divider",
          mb: 1,
        }}
      >
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1}
        alignItems={{ sm: "center" }}
        justifyContent="space-between"
        sx={{ mb: 1 }}
      >
        <Stack direction="row" alignItems="center" spacing={0.5}>
          <IconButton aria-label="Previous period" onClick={() => shiftPeriod(-1)} disabled={pending}>
            <ChevronLeftIcon />
          </IconButton>
          <Typography variant="subtitle1" fontWeight={600}>
            {rangeLabel}
          </Typography>
          <IconButton aria-label="Next period" onClick={() => shiftPeriod(1)} disabled={pending}>
            <ChevronRightIcon />
          </IconButton>
        </Stack>

        <Stack direction="row" spacing={1} alignItems="center">
          <ToggleButtonGroup
            exclusive
            size="small"
            value={viewState.calendarLayout}
            onChange={(_, value: "week" | "month" | null) => {
              if (!value) return;
              setViewState((current) => ({ ...current, calendarLayout: value }));
              refreshSchedule(value === "month" ? monthAnchor : weekStart, {
                layout: value,
                compact: viewState.compact,
              });
            }}
            aria-label="Calendar layout"
          >
            <ToggleButton value="week">Week</ToggleButton>
            <ToggleButton value="month">Month</ToggleButton>
          </ToggleButtonGroup>

          {!isMonthLayout && (
            <ToggleButtonGroup
              exclusive
              size="small"
              value={viewState.compact ? "compact" : "normal"}
              onChange={(_, value) => {
                if (!value) return;
                const compact = value === "compact";
                setViewState((current) => ({ ...current, compact }));
                refreshSchedule(weekStart, { layout: "week", compact });
              }}
              aria-label="View density"
            >
              <ToggleButton value="normal">Week</ToggleButton>
              <ToggleButton value="compact">2 weeks</ToggleButton>
            </ToggleButtonGroup>
          )}
        </Stack>
      </Stack>

      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={1}
        sx={{ mb: 2 }}
        useFlexGap
        flexWrap="wrap"
      >
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel id="schedule-filter-label">Network filter</InputLabel>
          <Select
            labelId="schedule-filter-label"
            label="Network filter"
            value={viewState.filterMode}
            onChange={(event) =>
              setViewState((current) => ({
                ...current,
                filterMode: event.target.value as ScheduleFilterMode,
              }))
            }
          >
            <MenuItem value="whole">Whole network</MenuItem>
            <MenuItem value="solo">Solo</MenuItem>
            <MenuItem value="sleeping_network">Sleeping network</MenuItem>
            <MenuItem value="person">Specific person</MenuItem>
          </Select>
        </FormControl>

        {viewState.filterMode === "person" && (
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel id="schedule-person-label">Person</InputLabel>
            <Select
              labelId="schedule-person-label"
              label="Person"
              value={viewState.filterPersonId}
              onChange={(event) =>
                setViewState((current) => ({ ...current, filterPersonId: event.target.value }))
              }
            >
              {people
                .filter((person) => person.id !== currentUserId && person.status === "active")
                .map((person) => (
                  <MenuItem key={person.id} value={person.id}>
                    {person.displayName}
                  </MenuItem>
                ))}
            </Select>
          </FormControl>
        )}

        <ToggleButton
          value="planning"
          selected={viewState.planningOpen}
          size="small"
          onClick={() =>
            setViewState((current) => ({ ...current, planningOpen: !current.planningOpen }))
          }
          sx={{
            alignSelf: "center",
            textTransform: "none",
          }}
        >
          <EventNoteIcon sx={{ mr: 0.5, fontSize: 18 }} />
          Planning
        </ToggleButton>
      </Stack>

      <Stack direction="row" spacing={2} sx={{ mb: 1 }} flexWrap="wrap" useFlexGap>
        <ScheduleLegendItem
          label="Proposed"
          fill={SCHEDULE_SEMANTIC_COLORS.proposed.fill}
          borderStyle="dashed"
        />
        <ScheduleLegendItem
          label="Approved events"
          fill={SCHEDULE_SEMANTIC_COLORS.resolved_event.fill}
        />
        <ScheduleLegendItem
          label="Sleeping"
          fill={SCHEDULE_SEMANTIC_COLORS.resolved_sleeping.fill}
        />
        <ScheduleLegendItem label="Conflict" fill={SCHEDULE_SEMANTIC_COLORS.conflict.fill} />
        <ScheduleLegendItem label="At risk / tentative" fill={SCHEDULE_SEMANTIC_COLORS.at_risk.fill} />
        <ScheduleLegendItem label="Archived" fill={SCHEDULE_SEMANTIC_COLORS.archived.fill} />
      </Stack>
      </Box>

      <ScheduleHeatmap
        events={filteredEvents}
        weekStartIso={rangeStart.toISOString()}
        dayCount={dayCount}
        timeZone={timeZone}
        layout={
          isMonthLayout ? "month" : viewState.compact ? "twoWeek" : "week"
        }
      />

      {isMonthLayout ? (
        <ScheduleMonthView
          monthAnchor={monthAnchor}
          events={filteredEvents}
          timeZone={timeZone}
          onEventClick={openScheduleEvent}
          onDayClick={handleMonthDayClick}
        />
      ) : (
        <ScheduleWeekView
          weekStart={weekStart}
          dayCount={dayCount}
          events={filteredEvents}
          compact={viewState.compact}
          timeZone={timeZone}
          onEventClick={openScheduleEvent}
        />
      )}

      <PlanningModeDrawer
        open={viewState.planningOpen}
        items={payload.planningItems}
        eventIdsOnCalendar={eventIdsOnCalendar}
        onClose={() => setViewState((current) => ({ ...current, planningOpen: false }))}
        onSelect={(id) => {
          openRelatedProposal(id);
          setViewState((current) => ({ ...current, planningOpen: false }));
        }}
      />

      <SeriesOccurrenceChooserDialog
        open={dialogState.chooserOpen}
        title={dialogState.chooserEvent?.title ?? "Recurring event"}
        onClose={closeChooser}
        onViewOccurrence={() => {
          const occurrenceId =
            dialogState.chooserEvent?.occurrenceProposalId ?? dialogState.chooserEvent?.proposalId;
          closeChooser();
          if (occurrenceId) openRelatedProposal(occurrenceId);
        }}
        onViewSeries={() => {
          const seriesId = dialogState.chooserEvent?.rootProposalId;
          closeChooser();
          if (seriesId) openRelatedProposal(seriesId);
        }}
      />

      <SliceDetailDialog
        open={dialogState.sliceOpen}
        rootProposalId={dialogState.sliceContext?.rootProposalId ?? null}
        sliceKind={dialogState.sliceContext?.sliceKind ?? null}
        sliceKey={dialogState.sliceContext?.sliceKey ?? null}
        timeZone={timeZone}
        onClose={() => {
          closeSlice();
          refreshCurrentView();
        }}
        onViewParent={(parentId) => {
          closeSlice();
          openRelatedProposal(parentId);
        }}
        onDetached={(newProposalId) => {
          openDetachedProposal(newProposalId);
        }}
      />

      <ProposalDetailDialog
        proposalId={dialogState.selectedProposalId}
        open={dialogState.detailOpen}
        onClose={() => {
          closeDetail();
          refreshCurrentView();
        }}
        onEdit={handleEditFromDetail}
        people={people}
        onOpenRelatedProposal={openRelatedProposal}
      />

      <ProposalDraftDialog
        open={dialogState.draftOpen}
        onClose={() => {
          closeDraft();
          refreshCurrentView();
        }}
        people={people}
        places={places}
        currentUserId={currentUserId}
        initialDetail={dialogState.editDetail}
      />
    </Box>
  );
}
