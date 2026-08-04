"use client";

import AddIcon from "@mui/icons-material/Add";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import FilterListIcon from "@mui/icons-material/FilterList";
import TodayIcon from "@mui/icons-material/Today";
import {
  Box,
  Button,
  Chip,
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
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ProposalPlaceOption } from "@/actions/proposals";
import {
  listScheduleEventsAction,
  type ScheduleFilterMode,
  type SchedulePayload,
} from "@/actions/schedule";
import type { PersonSummary } from "@/actions/users";
import { ScheduleAgendaView } from "@/components/schedule/ScheduleAgendaView";
import { ScheduleDaySheet } from "@/components/schedule/ScheduleDaySheet";
import { ScheduleDayView } from "@/components/schedule/ScheduleDayView";
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
  startOfLocalDayNoon,
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
import { GARDEN_TOKENS } from "@/theme/tokens";

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
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const previousPathRef = useRef<string | null>(null);
  const initialPayloadHydratedRef = useRef(false);
  const refreshSeqRef = useRef(0);
  const urlHydratedRef = useRef(false);
  const postHydrateFetchDoneRef = useRef(false);
  const [viewState, setViewState] = useState<ScheduleViewState>(() => {
    // Layout/filters from storage; always open on today’s week/month (PC-411).
    const loaded = loadScheduleViewState();
    const anchors = todayAnchors();
    return {
      ...loaded,
      weekStartIso: anchors.weekStartIso,
      monthAnchorIso: anchors.monthAnchorIso,
    };
  });
  const [payload, setPayload] = useState<SchedulePayload>(initialPayload);
  /** Explicit loading flag — useTransition is unreliable for async server actions (PC-164). */
  const [pending, setPending] = useState(false);
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
    () => startOfWeekMonday(new Date(viewState.weekStartIso), timeZone),
    [viewState.weekStartIso, timeZone],
  );
  const dayAnchor = useMemo(
    () => startOfLocalDayNoon(new Date(viewState.weekStartIso), timeZone),
    [viewState.weekStartIso, timeZone],
  );
  const monthAnchor = useMemo(
    () => startOfMonth(new Date(viewState.monthAnchorIso), timeZone),
    [viewState.monthAnchorIso, timeZone],
  );
  const isMonthLayout = viewState.calendarLayout === "month";
  const isDayLayout = viewState.calendarLayout === "day";
  const dayCount = isDayLayout ? 1 : viewState.compact ? 14 : 7;
  const periodMode = periodModeFromState(viewState);
  const fetchAnchor = isMonthLayout ? monthAnchor : isDayLayout ? dayAnchor : weekStart;
  const rangeEnd = useMemo(() => {
    return computeScheduleFetchRange(
      fetchAnchor,
      viewState.calendarLayout,
      viewState.compact,
      timeZone,
    ).rangeEnd;
  }, [fetchAnchor, viewState.calendarLayout, viewState.compact, timeZone]);

  const rangeStart = useMemo(() => {
    return computeScheduleFetchRange(
      fetchAnchor,
      viewState.calendarLayout,
      viewState.compact,
      timeZone,
    ).rangeStart;
  }, [fetchAnchor, viewState.calendarLayout, viewState.compact, timeZone]);

  const rangeLabel = useMemo(() => {
    if (isMonthLayout) {
      return monthAnchor.toLocaleDateString(undefined, {
        month: "long",
        year: "numeric",
        timeZone,
      });
    }
    if (isDayLayout) {
      return dayAnchor.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone,
      });
    }
    const end = addDays(weekStart, dayCount - 1);
    const fmt: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", timeZone };
    return `${weekStart.toLocaleDateString(undefined, fmt)} – ${end.toLocaleDateString(undefined, fmt)}`;
  }, [dayAnchor, dayCount, isDayLayout, isMonthLayout, monthAnchor, timeZone, weekStart]);

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
        timeZone,
      );

      const seq = ++refreshSeqRef.current;
      setPending(true);
      void (async () => {
        try {
          const result = await listScheduleEventsAction({
            rangeStart: start.toISOString(),
            rangeEnd: end.toISOString(),
          });
          if (seq !== refreshSeqRef.current) return;
          if (result.ok) setPayload(result.payload);
        } finally {
          if (seq === refreshSeqRef.current) setPending(false);
        }
      })();
    },
    [timeZone, viewState.calendarLayout, viewState.compact],
  );

  const refreshCurrentView = useCallback(() => {
    refreshSchedule(fetchAnchor, {
      layout: viewState.calendarLayout,
      compact: viewState.compact,
    });
  }, [
    fetchAnchor,
    refreshSchedule,
    viewState.calendarLayout,
    viewState.compact,
  ]);

  useEffect(() => {
    saveScheduleViewState(viewState);
  }, [viewState]);

  useEffect(() => {
    // Re-apply whenever RSC passes a new payload. Keep-alive can reuse this
    // fiber across soft navigations; a one-shot hydrate left stale empty weeks
    // after proposals were created on another tab (PC-407).
    setPayload(initialPayload);
    initialPayloadHydratedRef.current = true;
  }, [initialPayload]);

  /** Hydrate from URL once (PC-167); fall back to persisted anchors (PC-164). */
  useEffect(() => {
    if (urlHydratedRef.current) return;
    urlHydratedRef.current = true;
    // Read location directly — avoid useSearchParams remounts under Suspense.
    const parsed = parseScheduleUrlParams(
      typeof window !== "undefined" ? window.location.search : "",
    );
    setViewState((current) => {
      let next = { ...current };
      if (parsed.layout) next = applyPeriodMode(next, parsed.layout);
      if (parsed.anchor) {
        const anchorDate = new Date(`${parsed.anchor}T12:00:00`);
        if (!Number.isNaN(anchorDate.getTime())) {
          const nextLayout = next.calendarLayout;
          next = {
            ...next,
            weekStartIso:
              nextLayout === "day"
                ? startOfLocalDayNoon(anchorDate, timeZone).toISOString()
                : startOfWeekMonday(anchorDate, timeZone).toISOString(),
            monthAnchorIso: startOfMonth(anchorDate, timeZone).toISOString(),
          };
        }
      }
      return next;
    });
    if (parsed.open) {
      openProposal(parsed.open);
    }
  }, [openProposal]);

  /**
   * Keep URL in sync without Next router.replace — router updates remount this
   * client under Suspense and re-trigger fetch/pending loops (PC-167).
   */
  useEffect(() => {
    if (!urlHydratedRef.current) return;
    if (pathname !== "/schedule") return;
    if (typeof window === "undefined") return;
    const next = buildScheduleUrlSearch(
      viewState,
      dialogState.detailOpen ? dialogState.selectedProposalId : null,
    );
    const current = window.location.search.replace(/^\?/, "");
    if (next !== current) {
      const url = next ? `/schedule?${next}` : "/schedule";
      window.history.replaceState(window.history.state, "", url);
    }
  }, [
    dialogState.detailOpen,
    dialogState.selectedProposalId,
    pathname,
    viewState,
  ]);

  /**
   * Fetch when landing on Schedule if visible window ≠ SSR week payload (PC-164/167).
   * One-shot per visit; history.replaceState URL sync must not remount this client.
   */
  useEffect(() => {
    if (pathname !== "/schedule") {
      postHydrateFetchDoneRef.current = false;
      previousPathRef.current = pathname;
      return;
    }
    if (postHydrateFetchDoneRef.current) return;
    postHydrateFetchDoneRef.current = true;
    previousPathRef.current = pathname;

    const anchor =
      viewState.calendarLayout === "month"
        ? new Date(viewState.monthAnchorIso)
        : viewState.calendarLayout === "day"
          ? startOfLocalDayNoon(new Date(viewState.weekStartIso), timeZone)
          : new Date(viewState.weekStartIso);
    const initialMonday = startOfWeekMonday(new Date(initialWeekStartIso), timeZone);
    const viewMonday = startOfWeekMonday(anchor, timeZone);
    const sameWeek = isSameLocalCalendarDay(viewMonday, initialMonday);
    if (
      !sameWeek ||
      viewState.calendarLayout === "month" ||
      viewState.calendarLayout === "day" ||
      viewState.compact
    ) {
      refreshSchedule(anchor, {
        layout: viewState.calendarLayout,
        compact: viewState.compact,
      });
    }
    // Intentionally omit viewState from deps — run once after mount/hydrate for this visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot per schedule visit
  }, [pathname, refreshSchedule, initialWeekStartIso]);

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

  function shiftPeriod(delta: number) {
    if (isMonthLayout) {
      const next = new Date(monthAnchor);
      next.setMonth(next.getMonth() + delta);
      setViewState((current) => ({ ...current, monthAnchorIso: next.toISOString() }));
      refreshSchedule(next, { layout: "month" });
      return;
    }

    if (isDayLayout) {
      const next = startOfLocalDayNoon(addDays(dayAnchor, delta), timeZone);
      setViewState((current) => ({
        ...current,
        weekStartIso: next.toISOString(),
        monthAnchorIso: startOfMonth(next, timeZone).toISOString(),
      }));
      refreshSchedule(next, { layout: "day" });
      return;
    }

    const step = viewState.compact ? 14 : 7;
    const next = addDays(weekStart, delta * step);
    setViewState((current) => ({ ...current, weekStartIso: next.toISOString() }));
    refreshSchedule(next, { layout: "week", compact: viewState.compact });
  }

  function goToday() {
    const anchors = todayAnchors();
    const now = new Date();
    if (viewState.calendarLayout === "day") {
      const day = startOfLocalDayNoon(now, timeZone);
      setViewState((current) => ({
        ...current,
        weekStartIso: day.toISOString(),
        monthAnchorIso: anchors.monthAnchorIso,
      }));
      refreshSchedule(day, { layout: "day", compact: false });
      return;
    }
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
    const next = applyPeriodMode(viewState, mode);
    if (mode === "day") {
      const day = startOfLocalDayNoon(
        viewState.calendarLayout === "month" ? monthAnchor : new Date(viewState.weekStartIso),
        timeZone,
      );
      const withDay = { ...next, weekStartIso: day.toISOString() };
      setViewState(withDay);
      refreshSchedule(day, { layout: "day", compact: false });
      return;
    }
    // Keep current week/month anchors when switching period (PC-411 opens on today at mount only).
    setViewState(next);
    const anchor =
      next.calendarLayout === "month"
        ? new Date(next.monthAnchorIso)
        : startOfWeekMonday(new Date(next.weekStartIso), timeZone);
    refreshSchedule(anchor, { layout: next.calendarLayout, compact: next.compact });
  }

  function openDaySheet(day: Date) {
    setDaySheetDay(day);
  }

  function openWeekForDay(day: Date) {
    const monday = startOfWeekMonday(day, timeZone);
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

  const showAgenda = !isMonthLayout && !isDayLayout && isMobile;

  const filterActive = viewState.filterMode !== "whole";
  const filterLabel = (() => {
    if (viewState.filterMode === "solo") return "Solo";
    if (viewState.filterMode === "sleeping_network") return "Sleeping network";
    if (viewState.filterMode === "person") {
      const person = people.find((p) => p.id === viewState.filterPersonId);
      return person?.displayName ? `Person: ${person.displayName}` : "Person";
    }
    return "Whole network";
  })();

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
            <IconButton
              aria-label="Jump to today"
              onClick={goToday}
              disabled={pending}
              size="small"
            >
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
              <ToggleButton value="day">Day</ToggleButton>
              <ToggleButton value="week">Week</ToggleButton>
              <ToggleButton value="twoWeek">2 weeks</ToggleButton>
              <ToggleButton value="month">Month</ToggleButton>
            </ToggleButtonGroup>

            <IconButton
              aria-label={
                filterActive ? `View options, filter active: ${filterLabel}` : "View options"
              }
              aria-expanded={optionsOpen}
              onClick={() => setOptionsOpen(true)}
              size="small"
              color={filterActive ? "primary" : "default"}
            >
              <FilterListIcon />
            </IconButton>
            {filterActive && (
              <Chip
                size="small"
                color="primary"
                variant="outlined"
                label={filterLabel}
                onClick={() => setOptionsOpen(true)}
                onDelete={() =>
                  setViewState((current) => ({
                    ...current,
                    filterMode: "whole",
                    filterPersonId: "",
                  }))
                }
              />
            )}
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

          <Button variant="contained" onClick={() => setOptionsOpen(false)}>
            Done
          </Button>
        </Stack>
      </Drawer>

      <Box sx={{ opacity: pending ? 0.72 : 1, transition: "opacity 120ms ease" }}>
        <ScheduleHeatmap
          events={filteredEvents}
          weekStartIso={isDayLayout ? dayAnchor.toISOString() : rangeStart.toISOString()}
          dayCount={dayCount}
          timeZone={timeZone}
          layout={
            isMonthLayout
              ? "month"
              : isDayLayout
                ? "day"
                : viewState.compact
                  ? "twoWeek"
                  : "week"
          }
        />

        {isMonthLayout ? (
          <ScheduleMonthView
            monthAnchor={monthAnchor}
            events={filteredEvents}
            timeZone={timeZone}
            onEventClick={openScheduleEvent}
            onDayClick={openDaySheet}
          />
        ) : isDayLayout ? (
          <ScheduleDayView
            day={dayAnchor}
            events={filteredEvents}
            timeZone={timeZone}
            onEventClick={openScheduleEvent}
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
