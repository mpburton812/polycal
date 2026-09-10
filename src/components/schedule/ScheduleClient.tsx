"use client";

import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import {
  Box,
  Button,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Popover,
  Select,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  listScheduleEventsAction,
  type ScheduleEvent,
  type ScheduleFilterMode,
  type SchedulePayload,
} from "@/actions/schedule";
import type { PersonSummary } from "@/actions/users";
import { useProposalCreate } from "@/components/proposals/ProposalCreateContext";
import { ScheduleAgendaView } from "@/components/schedule/ScheduleAgendaView";
import { ScheduleDaySheet } from "@/components/schedule/ScheduleDaySheet";
import { ScheduleDayView } from "@/components/schedule/ScheduleDayView";
import { ScheduleHeatmap } from "@/components/schedule/ScheduleHeatmap";
import { ScheduleMonthView } from "@/components/schedule/ScheduleMonthView";
import {
  applyPeriodMode,
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
  startOfWeekSunday,
} from "@/lib/schedule/dates";
import { computeScheduleFetchRange } from "@/lib/schedule/fetch-range";
import { startOfMonth } from "@/lib/schedule/month-grid";
import { SCHEDULE_INVALIDATE_EVENT } from "@/lib/schedule/invalidate";
import { parseScheduleNlDate } from "@/lib/schedule/parse-nl-date";
import {
  shiftSegmentAnchor,
} from "@/lib/schedule/segments";
import { ssrWeekCoversVisibleRange } from "@/lib/schedule/visible-payload";
import { brutalPageTitleSx, brutalPopoverPaperSx } from "@/theme/brutalUi";
import { GARDEN_TOKENS } from "@/theme/tokens";

/** Heavy dialogs load on demand so the calendar paints sooner (PC-145). */
const ProposalDetailDialog = dynamic(
  () =>
    import("@/components/proposals/ProposalDetailDialog").then((mod) => ({
      default: mod.ProposalDetailDialog,
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
  currentUserId: string;
  acceptedPartnerIds: string[];
  timeZone: string;
}

function formatSegmentLabel(
  anchor: Date,
  layout: ScheduleCalendarLayout,
  timeZone: string,
): string {
  if (layout === "month") {
    return anchor.toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
      timeZone,
    });
  }
  if (layout === "day") {
    return anchor.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone,
    });
  }
  const end = addDays(anchor, 6);
  const fmt: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", timeZone };
  return `${anchor.toLocaleDateString(undefined, fmt)} – ${end.toLocaleDateString(undefined, fmt)}`;
}

/**
 * Schedule tab — Single window view anchored on active date period (PC-488 / PC-515).
 */
export function ScheduleClient({
  initialPayload,
  initialWeekStartIso,
  people,
  currentUserId,
  acceptedPartnerIds,
  timeZone,
}: ScheduleClientProps) {
  const pathname = usePathname();
  const urlHydratedRef = useRef(false);
  const scrollRootRef = useRef<HTMLDivElement | null>(null);
  const scheduleRootRef = useRef<HTMLDivElement | null>(null);

  const [viewState, setViewState] = useState<ScheduleViewState>(() => {
    const loaded = loadScheduleViewState();
    const anchors = todayAnchors();
    return {
      ...loaded,
      weekStartIso: anchors.weekStartIso,
      monthAnchorIso: anchors.monthAnchorIso,
    };
  });

  const [events, setEvents] = useState<ScheduleEvent[]>(() => initialPayload.events ?? []);
  const [pending, setPending] = useState(false);
  const [daySheetDay, setDaySheetDay] = useState<Date | null>(null);
  const [dateAnchorEl, setDateAnchorEl] = useState<HTMLElement | null>(null);
  const [nlDateText, setNlDateText] = useState("");
  const [nlDateError, setNlDateError] = useState<string | null>(null);
  const [viewportHeightPx, setViewportHeightPx] = useState<number | null>(null);

  const { openCreate, openEdit } = useProposalCreate();
  const {
    state: dialogState,
    openScheduleEvent,
    closeDetail,
    closeSlice,
    closeChooser,
    openRelatedProposal,
    openDetachedProposal,
  } = useScheduleTapRouter();

  const weekStart = useMemo(
    () => startOfWeekSunday(new Date(viewState.weekStartIso), timeZone),
    [viewState.weekStartIso, timeZone],
  );
  const monthAnchor = useMemo(
    () => startOfMonth(new Date(viewState.monthAnchorIso), timeZone),
    [viewState.monthAnchorIso, timeZone],
  );
  const dayAnchor = useMemo(
    () => startOfLocalDayNoon(new Date(viewState.weekStartIso), timeZone),
    [viewState.weekStartIso, timeZone],
  );

  const isMonthLayout = viewState.calendarLayout === "month";
  const isDayLayout = viewState.calendarLayout === "day";

  const primaryAnchor = useMemo(() => {
    if (isMonthLayout) return monthAnchor;
    if (isDayLayout) return dayAnchor;
    return weekStart;
  }, [isMonthLayout, isDayLayout, monthAnchor, dayAnchor, weekStart]);

  const fetchRange = useMemo(
    () => computeScheduleFetchRange(primaryAnchor, viewState.calendarLayout, timeZone),
    [primaryAnchor, viewState.calendarLayout, timeZone],
  );

  const rangeStartIso = fetchRange.rangeStart.toISOString();
  const rangeEndIso = fetchRange.rangeEnd.toISOString();

  const fetchEventsForRange = useCallback(
    async (anchorDate: Date, layout: ScheduleCalendarLayout) => {
      setPending(true);
      try {
        const range = computeScheduleFetchRange(anchorDate, layout, timeZone);
        const res = await listScheduleEventsAction({
          rangeStart: range.rangeStart.toISOString(),
          rangeEnd: range.rangeEnd.toISOString(),
        });
        setEvents(res.payload?.events ?? []);
      } finally {
        setPending(false);
      }
    },
    [timeZone],
  );

  const scrollToTopOrToday = useCallback(() => {
    requestAnimationFrame(() => {
      const root = scrollRootRef.current;
      if (!root) return;
      if (viewState.calendarLayout === "month") {
        const todayCell = document.getElementById("schedule-month-today");
        if (todayCell) {
          todayCell.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
          return;
        }
      }
      root.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    });
  }, [viewState.calendarLayout]);

  /** Size the schedule column to fill viewport below app chrome and above bottom nav (PC-493 / PC-494). */
  useLayoutEffect(() => {
    function measure() {
      const root = scheduleRootRef.current;
      const bottomNav = document.querySelector('[aria-label="Main navigation"]');
      const top = root?.getBoundingClientRect().top ?? 80;
      const bottom =
        bottomNav instanceof HTMLElement ? bottomNav.getBoundingClientRect().height : 56;
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      setViewportHeightPx(Math.max(240, Math.round(viewportHeight - top - bottom)));
    }
    measure();
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
    };
  }, []);

  /** Prevent document scroll so Schedule chrome stays fixed (PC-494). */
  useEffect(() => {
    if (pathname !== "/schedule") return;
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.overflow;
    const prevBody = body.style.overflow;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    return () => {
      html.style.overflow = prevHtml;
      body.style.overflow = prevBody;
    };
  }, [pathname]);

  const refreshCurrentView = useCallback(() => {
    void fetchEventsForRange(primaryAnchor, viewState.calendarLayout);
  }, [fetchEventsForRange, primaryAnchor, viewState.calendarLayout]);

  useEffect(() => {
    saveScheduleViewState(viewState);
  }, [viewState]);

  // Initial seed from SSR week when applicable; otherwise fetch range (PC-474 / PC-515).
  useEffect(() => {
    const covers = ssrWeekCoversVisibleRange({
      layout: viewState.calendarLayout,
      visibleAnchor: primaryAnchor,
      ssrWeekStart: new Date(initialWeekStartIso),
      timeZone,
    });
    if (!covers) {
      void fetchEventsForRange(primaryAnchor, viewState.calendarLayout);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  useEffect(() => {
    function onInvalidate() {
      refreshCurrentView();
    }
    window.addEventListener(SCHEDULE_INVALIDATE_EVENT, onInvalidate);
    return () => window.removeEventListener(SCHEDULE_INVALIDATE_EVENT, onInvalidate);
  }, [refreshCurrentView]);

  useEffect(() => {
    if (urlHydratedRef.current) return;
    urlHydratedRef.current = true;
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
                : startOfWeekSunday(anchorDate, timeZone).toISOString(),
            monthAnchorIso: startOfMonth(anchorDate, timeZone).toISOString(),
          };
        }
      }
      return next;
    });
    if (parsed.open) {
      const match = events.find((e) => e.proposalId === parsed.open);
      if (match) openScheduleEvent(match);
    }
  }, [events, openScheduleEvent, timeZone]);

  const filteredEvents = useMemo(
    () =>
      filterScheduleEvents(
        events,
        viewState.filterMode,
        currentUserId,
        viewState.filterPersonId || undefined,
        acceptedPartnerIds,
      ),
    [events, viewState.filterMode, viewState.filterPersonId, currentUserId, acceptedPartnerIds],
  );

  function shiftPeriod(delta: number) {
    if (isMonthLayout) {
      const next = shiftSegmentAnchor(monthAnchor, "month", delta, timeZone);
      setViewState((current) => ({ ...current, monthAnchorIso: next.toISOString() }));
      void fetchEventsForRange(next, "month");
      scrollToTopOrToday();
      return;
    }

    if (isDayLayout) {
      const next = shiftSegmentAnchor(dayAnchor, "day", delta, timeZone);
      setViewState((current) => ({
        ...current,
        weekStartIso: next.toISOString(),
        monthAnchorIso: startOfMonth(next, timeZone).toISOString(),
      }));
      void fetchEventsForRange(next, "day");
      scrollToTopOrToday();
      return;
    }

    const next = shiftSegmentAnchor(weekStart, "week", delta, timeZone);
    setViewState((current) => ({
      ...current,
      weekStartIso: next.toISOString(),
      monthAnchorIso: startOfMonth(next, timeZone).toISOString(),
    }));
    void fetchEventsForRange(next, "week");
    scrollToTopOrToday();
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
      void fetchEventsForRange(day, "day");
      scrollToTopOrToday();
      return;
    }

    setViewState((current) => ({ ...current, ...anchors }));
    const anchor =
      viewState.calendarLayout === "month"
        ? new Date(anchors.monthAnchorIso)
        : new Date(anchors.weekStartIso);

    void fetchEventsForRange(anchor, viewState.calendarLayout);
    scrollToTopOrToday();
  }

  function jumpToParsedDate(date: Date) {
    const layout = viewState.calendarLayout;
    if (layout === "day") {
      const day = startOfLocalDayNoon(date, timeZone);
      setViewState((current) => ({
        ...current,
        weekStartIso: day.toISOString(),
        monthAnchorIso: startOfMonth(day, timeZone).toISOString(),
      }));
      void fetchEventsForRange(day, "day");
      scrollToTopOrToday();
      return;
    }
    if (layout === "month") {
      const month = startOfMonth(date, timeZone);
      setViewState((current) => ({
        ...current,
        weekStartIso: startOfWeekSunday(date, timeZone).toISOString(),
        monthAnchorIso: month.toISOString(),
      }));
      void fetchEventsForRange(month, "month");
      scrollToTopOrToday();
      return;
    }
    const sunday = startOfWeekSunday(date, timeZone);
    setViewState((current) => ({
      ...current,
      weekStartIso: sunday.toISOString(),
      monthAnchorIso: startOfMonth(date, timeZone).toISOString(),
    }));
    void fetchEventsForRange(sunday, "week");
    scrollToTopOrToday();
  }

  function submitNlDate() {
    const parsed = parseScheduleNlDate(nlDateText);
    if (!parsed) {
      setNlDateError("Could not understand that date. Try “next Tuesday” or YYYY-MM-DD.");
      return;
    }
    setNlDateError(null);
    setDateAnchorEl(null);
    setNlDateText("");
    jumpToParsedDate(parsed);
  }

  function handlePeriodModeChange(mode: SchedulePeriodMode) {
    const next = applyPeriodMode(viewState, mode);
    let targetAnchor = primaryAnchor;
    if (mode === "day") {
      targetAnchor = startOfLocalDayNoon(
        viewState.calendarLayout === "month" ? monthAnchor : new Date(viewState.weekStartIso),
        timeZone,
      );
      setViewState({ ...next, weekStartIso: targetAnchor.toISOString() });
    } else if (mode === "month") {
      targetAnchor = startOfMonth(new Date(viewState.weekStartIso), timeZone);
      setViewState({ ...next, monthAnchorIso: targetAnchor.toISOString() });
    } else {
      targetAnchor = startOfWeekSunday(new Date(next.weekStartIso), timeZone);
      setViewState(next);
    }
    void fetchEventsForRange(targetAnchor, mode);
    scrollToTopOrToday();
  }

  function openDayLayout(day: Date) {
    const noon = startOfLocalDayNoon(day, timeZone);
    setViewState((current) => ({
      ...current,
      calendarLayout: "day",
      weekStartIso: noon.toISOString(),
      monthAnchorIso: startOfMonth(day, timeZone).toISOString(),
    }));
    void fetchEventsForRange(noon, "day");
    scrollToTopOrToday();
  }

  function openDaySheet(day: Date) {
    setDaySheetDay(day);
  }

  function openWeekForDay(day: Date) {
    const sunday = startOfWeekSunday(day, timeZone);
    setDaySheetDay(null);
    setViewState((current) => ({
      ...current,
      calendarLayout: "week",
      weekStartIso: sunday.toISOString(),
      monthAnchorIso: day.toISOString(),
    }));
    void fetchEventsForRange(sunday, "week");
    scrollToTopOrToday();
  }

  function createForDay(day: Date, lockedType: "event" | "sleeping") {
    const start = new Date(day);
    start.setHours(lockedType === "event" ? 10 : 0, 0, 0, 0);
    setDaySheetDay(null);
    openCreate({ lockedType, initialStartAt: start.toISOString() });
  }

  const datePopoverOpen = Boolean(dateAnchorEl);
  const rangeLabel = formatSegmentLabel(primaryAnchor, viewState.calendarLayout, timeZone);
  const dayCount = isMonthLayout ? 42 : isDayLayout ? 1 : 7;

  return (
    <Box
      ref={scheduleRootRef}
      sx={{
        pb: 2,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        overflow: "hidden",
        ...(viewportHeightPx != null
          ? { height: viewportHeightPx, maxHeight: viewportHeightPx }
          : {}),
      }}
      data-testid="schedule-ready"
      data-ready={pending ? "false" : "true"}
      data-range-start={rangeStartIso}
      data-range-end={rangeEndIso}
      data-segment-count={1}
      aria-busy={pending}
    >
      <Box
        sx={{ display: "none" }}
        data-testid="schedule-range-start"
        data-value={rangeStartIso}
      />
      <Box
        sx={{ display: "none" }}
        data-testid="schedule-range-end"
        data-value={rangeEndIso}
      />
      <Box
        data-testid="schedule-sticky-chrome"
        sx={{
          flexShrink: 0,
          bgcolor: "background.default",
          pb: 0.5,
          borderBottom: `1px solid ${GARDEN_TOKENS.outlineSoft}`,
          mb: 0.5,
          touchAction: "none",
        }}
      >
        <Typography variant="h5" component="h1" sx={{ ...brutalPageTitleSx, mb: 0.5 }}>
          Schedule
        </Typography>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1}
          alignItems={{ sm: "center" }}
          justifyContent="space-between"
        >
          <Stack direction="row" alignItems="center" spacing={0.5} flexWrap="wrap" useFlexGap>
            <IconButton
              aria-label="Previous period"
              onClick={() => shiftPeriod(-1)}
              disabled={pending}
            >
              <ChevronLeftIcon />
            </IconButton>
            <Button
              variant="text"
              color="inherit"
              onClick={(event) => {
                setNlDateError(null);
                setNlDateText("");
                setDateAnchorEl(event.currentTarget);
              }}
              aria-label={`Jump to date, currently ${rangeLabel}`}
              sx={{
                textTransform: "none",
                fontWeight: 600,
                fontSize: "1rem",
                px: 0.75,
                minWidth: 0,
              }}
            >
              {rangeLabel}
            </Button>
            <IconButton
              aria-label="Next period"
              onClick={() => shiftPeriod(1)}
              disabled={pending}
            >
              <ChevronRightIcon />
            </IconButton>
    <Button
      variant="outlined"
      size="small"
      onClick={goToday}
      aria-label="Goto today"
      sx={{ fontWeight: 600, textTransform: "none" }}
    >
      Goto Today
    </Button>
          </Stack>

          <Stack direction="row" spacing={1} alignItems="center">
    <ToggleButtonGroup
      value={periodModeFromState(viewState)}
      exclusive
      size="small"
      onChange={(_, value) => {
        if (value) handlePeriodModeChange(value as SchedulePeriodMode);
      }}
      aria-label="Calendar period"
    >
      <ToggleButton value="day" aria-label="Daily">
        Daily
      </ToggleButton>
      <ToggleButton value="week" aria-label="Weekly">
        Weekly
      </ToggleButton>
      <ToggleButton value="month" aria-label="Monthly">
        Monthly
      </ToggleButton>
    </ToggleButtonGroup>

            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel id="schedule-filter-label">Filter</InputLabel>
              <Select
                labelId="schedule-filter-label"
                data-testid="schedule-network-filter"
                aria-label="Network filter"
                value={
                  viewState.filterMode === "person"
                    ? `person:${viewState.filterPersonId}`
                    : viewState.filterMode
                }
                label="Filter"
                onChange={(e) => {
                  const val = e.target.value as string;
                  let next: ScheduleViewState;
                  if (val.startsWith("person:")) {
                    const pid = val.slice("person:".length);
                    next = { ...viewState, filterMode: "person", filterPersonId: pid };
                  } else {
                    next = {
                      ...viewState,
                      filterMode: val as ScheduleFilterMode,
                      filterPersonId: "",
                    };
                  }
                  setViewState(next);
                  void fetchEventsForRange(primaryAnchor, viewState.calendarLayout);
                }}
              >
                <MenuItem value="whole">Whole Network</MenuItem>
                <MenuItem value="solo">Solo</MenuItem>
                <MenuItem value="sleeping_network">Sleeping network</MenuItem>
                {people
                  .filter((p) => p.id !== currentUserId)
                  .map((p) => (
                    <MenuItem key={p.id} value={`person:${p.id}`}>
                      {p.displayName}
                    </MenuItem>
                  ))}
              </Select>
            </FormControl>
          </Stack>
        </Stack>
      </Box>

      <Popover
        open={datePopoverOpen}
        anchorEl={dateAnchorEl}
        onClose={() => setDateAnchorEl(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        slotProps={{ paper: { sx: brutalPopoverPaperSx } }}
      >
        <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700 }}>
          Go to date
        </Typography>
        <Stack spacing={1.5}>
          <TextField
            autoFocus
            size="small"
            fullWidth
            label="Natural language date"
            placeholder="next Tuesday or 2026-09-15"
            value={nlDateText}
            onChange={(event) => {
              setNlDateText(event.target.value);
              setNlDateError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                submitNlDate();
              }
            }}
            error={Boolean(nlDateError)}
            helperText={nlDateError ?? "Jump the current Daily / Weekly / Monthly view."}
            inputProps={{ "aria-label": "Natural language date" }}
          />
          <Button variant="contained" onClick={submitNlDate}>
            Go
          </Button>
        </Stack>
      </Popover>

      <Box
        ref={scrollRootRef}
        data-testid="schedule-scroll-root"
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          overscrollBehavior: "contain",
          WebkitOverflowScrolling: "touch",
          scrollBehavior: "smooth",
          transition: "opacity 120ms ease",
        }}
      >
        <ScheduleHeatmap
          events={filteredEvents}
          weekStartIso={isDayLayout ? dayAnchor.toISOString() : rangeStartIso}
          dayCount={dayCount}
          timeZone={timeZone}
          layout={isMonthLayout ? "month" : isDayLayout ? "day" : "week"}
        />

        <Box
          data-testid="schedule-segment"
          data-segment-anchor={primaryAnchor.toISOString()}
          sx={{ mt: 1 }}
        >
          {isMonthLayout ? (
            <ScheduleMonthView
              monthAnchor={primaryAnchor}
              events={filteredEvents}
              timeZone={timeZone}
              onEventClick={openScheduleEvent}
              onDayClick={openDayLayout}
            />
          ) : isDayLayout ? (
            <ScheduleDayView
              day={primaryAnchor}
              events={filteredEvents}
              timeZone={timeZone}
              onEventClick={openScheduleEvent}
            />
          ) : (
            <ScheduleAgendaView
              weekStartIso={primaryAnchor.toISOString()}
              dayCount={7}
              events={filteredEvents}
              timeZone={timeZone}
              onEventClick={openScheduleEvent}
              onDayHeaderClick={openDayLayout}
              onDayOverflowClick={openDaySheet}
              pinToday={false}
            />
          )}
        </Box>
      </Box>

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
        onEdit={(detail) => {
          closeDetail();
          openEdit(detail);
        }}
        people={people}
        onOpenRelatedProposal={openRelatedProposal}
      />
    </Box>
  );
}
