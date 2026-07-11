"use client";

import AddIcon from "@mui/icons-material/Add";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import EventNoteIcon from "@mui/icons-material/EventNote";
import FilterListIcon from "@mui/icons-material/FilterList";
import TodayIcon from "@mui/icons-material/Today";
import {
  Box,
  Button,
  Drawer,
  Fab,
  FormControl,
  IconButton,
  InputLabel,
  Menu,
  MenuItem,
  Select,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";

import type { ProposalPlaceOption } from "@/actions/proposals";
import {
  listScheduleEventsAction,
  type ScheduleFilterMode,
  type SchedulePayload,
} from "@/actions/schedule";
import type { PersonSummary } from "@/actions/users";
import { PlanningModeDrawer } from "@/components/schedule/PlanningModeDrawer";
import { ScheduleAgendaView } from "@/components/schedule/ScheduleAgendaView";
import { ScheduleDaySheet } from "@/components/schedule/ScheduleDaySheet";
import { ScheduleHeatmap } from "@/components/schedule/ScheduleHeatmap";
import { ScheduleMonthView } from "@/components/schedule/ScheduleMonthView";
import { ScheduleWeekView } from "@/components/schedule/ScheduleWeekView";
import {
  applyPeriodMode,
  buildScheduleUrlSearch,
  loadScheduleViewState,
  parseScheduleUrlParams,
  periodModeFromState,
  saveScheduleViewState,
  todayAnchors,
  type ScheduleCalendarLayout,
  type SchedulePeriodMode,
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
import { GARDEN_TOKENS, SCHEDULE_SEMANTIC_COLORS } from "@/theme/tokens";

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

interface ScheduleLegendItemProps {
  label: string;
  fill: string;
  borderStyle?: "solid" | "dashed";
}

/** Semantic fill swatch for the schedule status legend (PC-77 / PC-164). */
function ScheduleLegendItem({ label, fill, borderStyle = "solid" }: ScheduleLegendItemProps) {
  return (
    <Stack direction="row" alignItems="center" spacing={0.5}>
      <Box
        sx={{
          width: 10,
          height: 10,
          bgcolor: fill,
          border: `1px ${borderStyle} ${GARDEN_TOKENS.ink}`,
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
 * Schedule tab — weekly/month calendar with Garden chrome (PC-42 / PC-164–167).
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const previousPathRef = useRef<string | null>(null);
  const initialPayloadHydratedRef = useRef(false);
  const refreshSeqRef = useRef(0);
  const urlHydratedRef = useRef(false);
  const [viewState, setViewState] = useState<ScheduleViewState>(() => ({
    ...loadScheduleViewState(),
    weekStartIso: initialWeekStartIso,
    monthAnchorIso: initialWeekStartIso,
  }));
  const [payload, setPayload] = useState<SchedulePayload>(initialPayload);
  const [pending, startTransition] = useTransition();
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [daySheetDay, setDaySheetDay] = useState<Date | null>(null);
  const [fabAnchor, setFabAnchor] = useState<null | HTMLElement>(null);
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
    openCreateDraft,
    openProposal,
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
  const periodMode = periodModeFromState(viewState);
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

  /** Hydrate from URL once (PC-167); fall back to persisted anchors (PC-164). */
  useEffect(() => {
    if (urlHydratedRef.current) return;
    urlHydratedRef.current = true;
    const parsed = parseScheduleUrlParams(searchParams.toString());
    setViewState((current) => {
      let next = { ...current };
      if (parsed.layout) next = applyPeriodMode(next, parsed.layout);
      if (parsed.anchor) {
        const anchorDate = new Date(`${parsed.anchor}T12:00:00`);
        if (!Number.isNaN(anchorDate.getTime())) {
          next = {
            ...next,
            weekStartIso: startOfWeekMonday(anchorDate).toISOString(),
            monthAnchorIso: startOfMonth(anchorDate).toISOString(),
          };
        }
      }
      return next;
    });
    if (parsed.open) {
      openProposal(parsed.open);
    }
  }, [openProposal, searchParams]);

  /** Keep URL in sync with view (PC-167). */
  useEffect(() => {
    if (!urlHydratedRef.current) return;
    if (pathname !== "/schedule") return;
    const next = buildScheduleUrlSearch(
      viewState,
      dialogState.detailOpen ? dialogState.selectedProposalId : null,
    );
    const current = searchParams.toString();
    if (next !== current) {
      router.replace(`/schedule?${next}`, { scroll: false });
    }
  }, [
    dialogState.detailOpen,
    dialogState.selectedProposalId,
    pathname,
    router,
    searchParams,
    viewState,
  ]);

  /**
   * Opening Schedule restores persisted anchors (PC-164). Refetch when needed.
   */
  useEffect(() => {
    const onSchedule = pathname === "/schedule";
    const enteringSchedule =
      onSchedule &&
      (previousPathRef.current === null || previousPathRef.current !== "/schedule");

    if (enteringSchedule) {
      const anchor =
        viewState.calendarLayout === "month"
          ? new Date(viewState.monthAnchorIso)
          : new Date(viewState.weekStartIso);
      const initialMonday = startOfWeekMonday(new Date(initialWeekStartIso));
      const viewMonday = startOfWeekMonday(anchor);
      const sameWeek = isSameLocalCalendarDay(viewMonday, initialMonday);
      if (!sameWeek || viewState.calendarLayout === "month" || viewState.compact) {
        refreshSchedule(anchor, {
          layout: viewState.calendarLayout,
          compact: viewState.compact,
        });
      }
    }

    previousPathRef.current = pathname;
  }, [
    pathname,
    refreshSchedule,
    viewState.calendarLayout,
    viewState.compact,
    viewState.monthAnchorIso,
    viewState.weekStartIso,
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

  function goToday() {
    const anchors = todayAnchors();
    setViewState((current) => ({ ...current, ...anchors }));
    const anchor =
      viewState.calendarLayout === "month"
        ? new Date(anchors.monthAnchorIso)
        : new Date(anchors.weekStartIso);
    refreshSchedule(anchor, {
      layout: viewState.calendarLayout,
      compact: viewState.compact,
    });
  }

  function handlePeriodModeChange(mode: SchedulePeriodMode) {
    setViewState((current) => applyPeriodMode(current, mode));
    const next = applyPeriodMode(viewState, mode);
    const anchor =
      next.calendarLayout === "month"
        ? new Date(next.monthAnchorIso)
        : new Date(next.weekStartIso);
    refreshSchedule(anchor, { layout: next.calendarLayout, compact: next.compact });
  }

  function openDaySheet(day: Date) {
    setDaySheetDay(day);
  }

  function openWeekForDay(day: Date) {
    const monday = startOfWeekMonday(day);
    setDaySheetDay(null);
    setViewState((current) => ({
      ...current,
      calendarLayout: "week",
      compact: false,
      weekStartIso: monday.toISOString(),
      monthAnchorIso: day.toISOString(),
    }));
    refreshSchedule(monday, { layout: "week", compact: false });
  }

  function createForDay(day: Date, lockedType: "event" | "sleeping") {
    const start = new Date(day);
    start.setHours(lockedType === "event" ? 10 : 0, 0, 0, 0);
    setDaySheetDay(null);
    openCreateDraft({ lockedType, initialStartAt: start.toISOString() });
  }

  const showAgenda = !isMonthLayout && isMobile;

  return (
    <Box
      sx={{ pb: 10 }}
      data-testid="schedule-ready"
      data-ready={pending ? "false" : "true"}
      data-range-start={rangeStart.toISOString()}
      data-range-end={rangeEnd.toISOString()}
      aria-busy={pending}
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
          borderBottom: `1px solid ${GARDEN_TOKENS.outlineSoft}`,
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
            <IconButton
              aria-label="Previous period"
              onClick={() => shiftPeriod(-1)}
              disabled={pending}
            >
              <ChevronLeftIcon />
            </IconButton>
            <Typography variant="subtitle1" fontWeight={600}>
              {rangeLabel}
            </Typography>
            <IconButton
              aria-label="Next period"
              onClick={() => shiftPeriod(1)}
              disabled={pending}
            >
              <ChevronRightIcon />
            </IconButton>
            <IconButton aria-label="Today" onClick={goToday} disabled={pending} size="small">
              <TodayIcon fontSize="small" />
            </IconButton>
          </Stack>

          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={periodMode}
              onChange={(_, value: SchedulePeriodMode | null) => {
                if (!value) return;
                handlePeriodModeChange(value);
              }}
              aria-label="Calendar period"
            >
              <ToggleButton value="week">Week</ToggleButton>
              <ToggleButton value="twoWeek">2 weeks</ToggleButton>
              <ToggleButton value="month">Month</ToggleButton>
            </ToggleButtonGroup>

            <IconButton
              aria-label="View options"
              aria-expanded={optionsOpen}
              onClick={() => setOptionsOpen(true)}
              size="small"
            >
              <FilterListIcon />
            </IconButton>

            <ToggleButton
              value="planning"
              selected={viewState.planningOpen}
              size="small"
              aria-label="Planning"
              aria-pressed={viewState.planningOpen}
              onClick={() =>
                setViewState((current) => ({
                  ...current,
                  planningOpen: !current.planningOpen,
                }))
              }
              sx={{ textTransform: "none" }}
            >
              <EventNoteIcon sx={{ mr: 0.5, fontSize: 18 }} />
              Planning
            </ToggleButton>
          </Stack>
        </Stack>
      </Box>

      <Drawer
        anchor="right"
        open={optionsOpen}
        onClose={() => setOptionsOpen(false)}
        PaperProps={{ sx: { width: { xs: "100%", sm: 320 }, p: 2 } }}
      >
        <Typography variant="h6" sx={{ mb: 2 }}>
          View options
        </Typography>
        <Stack spacing={2}>
          <FormControl size="small" fullWidth>
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
            <FormControl size="small" fullWidth>
              <InputLabel id="schedule-person-label">Person</InputLabel>
              <Select
                labelId="schedule-person-label"
                label="Person"
                value={viewState.filterPersonId}
                onChange={(event) =>
                  setViewState((current) => ({
                    ...current,
                    filterPersonId: event.target.value,
                  }))
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

          <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
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
            <ScheduleLegendItem
              label="At risk / tentative"
              fill={SCHEDULE_SEMANTIC_COLORS.at_risk.fill}
            />
            <ScheduleLegendItem label="Archived" fill={SCHEDULE_SEMANTIC_COLORS.archived.fill} />
            <ScheduleLegendItem
              label="Masked"
              fill={SCHEDULE_SEMANTIC_COLORS.masked.fill}
              borderStyle="dashed"
            />
          </Stack>

          <Button variant="contained" onClick={() => setOptionsOpen(false)}>
            Done
          </Button>
        </Stack>
      </Drawer>

      <Box sx={{ opacity: pending ? 0.72 : 1, transition: "opacity 120ms ease" }}>
        <ScheduleHeatmap
          events={filteredEvents}
          weekStartIso={rangeStart.toISOString()}
          dayCount={dayCount}
          timeZone={timeZone}
          layout={isMonthLayout ? "month" : viewState.compact ? "twoWeek" : "week"}
        />

        {isMonthLayout ? (
          <ScheduleMonthView
            monthAnchor={monthAnchor}
            events={filteredEvents}
            timeZone={timeZone}
            onEventClick={openScheduleEvent}
            onDayClick={openDaySheet}
          />
        ) : showAgenda ? (
          <ScheduleAgendaView
            weekStart={weekStart}
            dayCount={dayCount}
            events={filteredEvents}
            timeZone={timeZone}
            onEventClick={openScheduleEvent}
            onDayHeaderClick={openDaySheet}
            onDayOverflowClick={openDaySheet}
          />
        ) : (
          <ScheduleWeekView
            weekStart={weekStart}
            dayCount={dayCount}
            events={filteredEvents}
            compact={viewState.compact}
            timeZone={timeZone}
            onEventClick={openScheduleEvent}
            onDayOverflowClick={viewState.compact ? openDaySheet : undefined}
          />
        )}
      </Box>

      <Fab
        color="primary"
        aria-label="Create on schedule"
        onClick={(event) => setFabAnchor(event.currentTarget)}
        sx={{
          position: "fixed",
          right: 16,
          bottom: 88,
          bgcolor: GARDEN_TOKENS.sage,
          color: GARDEN_TOKENS.surface,
          border: `2px solid ${GARDEN_TOKENS.ink}`,
          boxShadow: "none",
          "&:hover": { bgcolor: "#557A5C" },
        }}
      >
        <AddIcon />
      </Fab>
      <Menu anchorEl={fabAnchor} open={Boolean(fabAnchor)} onClose={() => setFabAnchor(null)}>
        <MenuItem
          onClick={() => {
            setFabAnchor(null);
            createForDay(new Date(), "event");
          }}
        >
          New event
        </MenuItem>
        <MenuItem
          onClick={() => {
            setFabAnchor(null);
            createForDay(new Date(), "sleeping");
          }}
        >
          New sleeping
        </MenuItem>
      </Menu>

      <ScheduleDaySheet
        open={Boolean(daySheetDay)}
        day={daySheetDay}
        events={filteredEvents}
        timeZone={timeZone}
        onClose={() => setDaySheetDay(null)}
        onEventClick={(event) => {
          setDaySheetDay(null);
          openScheduleEvent(event);
        }}
        onOpenInWeek={openWeekForDay}
        onCreateEvent={(day) => createForDay(day, "event")}
        onCreateSleeping={(day) => createForDay(day, "sleeping")}
      />

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
        lockedProposalType={dialogState.createLockedType ?? undefined}
        initialStartAt={dialogState.createInitialStartAt}
      />
    </Box>
  );
}
