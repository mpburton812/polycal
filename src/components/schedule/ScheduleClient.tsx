"use client";

import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
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
  useMediaQuery,
  useTheme,
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
import { SCHEDULE_INVALIDATE_EVENT } from "@/lib/schedule/invalidate";
import { parseScheduleNlDate } from "@/lib/schedule/parse-nl-date";
import {
  buildScheduleSegment,
  normalizeSegmentAnchor,
  SCHEDULE_VIEWPORT_FILL_MAX,
  scheduleMaxSegments,
  shiftSegmentAnchor,
  type ScheduleSegment,
  trimScheduleSegments,
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
 * Schedule tab — Daily / Weekly / Monthly segments with bi-directional infinite scroll (PC-488 / PC-489).
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
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const previousPathRef = useRef<string | null>(null);
  const stackSeqRef = useRef(0);
  const urlHydratedRef = useRef(false);
  const postHydrateFetchDoneRef = useRef(false);
  const scrollRootRef = useRef<HTMLDivElement | null>(null);
  const topSentinelRef = useRef<HTMLDivElement | null>(null);
  const bottomSentinelRef = useRef<HTMLDivElement | null>(null);
  const loadingPastRef = useRef(false);
  const loadingFutureRef = useRef(false);
  const fillRunningRef = useRef(false);
  const segmentsRef = useRef<ScheduleSegment[]>([]);

  const [viewState, setViewState] = useState<ScheduleViewState>(() => {
    const loaded = loadScheduleViewState();
    const anchors = todayAnchors();
    return {
      ...loaded,
      weekStartIso: anchors.weekStartIso,
      monthAnchorIso: anchors.monthAnchorIso,
    };
  });
  const [segments, setSegmentsState] = useState<ScheduleSegment[]>([]);
  const setSegments = useCallback((next: ScheduleSegment[] | ((prev: ScheduleSegment[]) => ScheduleSegment[])) => {
    setSegmentsState((prev) => {
      const resolved = typeof next === "function" ? next(prev) : next;
      segmentsRef.current = resolved;
      return resolved;
    });
  }, []);
  const [pending, setPending] = useState(false);
  const [loadingPast, setLoadingPast] = useState(false);
  const [loadingFuture, setLoadingFuture] = useState(false);
  const [daySheetDay, setDaySheetDay] = useState<Date | null>(null);
  const [dateAnchorEl, setDateAnchorEl] = useState<HTMLElement | null>(null);
  const [nlDateText, setNlDateText] = useState("");
  const [nlDateError, setNlDateError] = useState<string | null>(null);
  const scheduleRootRef = useRef<HTMLDivElement | null>(null);
  const [viewportHeightPx, setViewportHeightPx] = useState<number | null>(null);
  const scrollTargetAnchorRef = useRef<string | null>(null);
  const { openCreate, openEdit } = useProposalCreate();
  const {
    state: dialogState,
    openScheduleEvent,
    closeDetail,
    closeSlice,
    closeChooser,
    openRelatedProposal,
    openDetachedProposal,
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
  const periodMode = periodModeFromState(viewState);
  const primaryAnchor = isMonthLayout ? monthAnchor : isDayLayout ? dayAnchor : weekStart;
  const dayCount = isDayLayout ? 1 : 7;

  const primarySegment = useMemo(() => {
    const id = normalizeSegmentAnchor(
      primaryAnchor,
      viewState.calendarLayout,
      timeZone,
    ).toISOString();
    return segments.find((segment) => segment.id === id) ?? segments[0] ?? null;
  }, [primaryAnchor, segments, timeZone, viewState.calendarLayout]);

  const rangeStartIso = primarySegment?.rangeStartIso ?? primaryAnchor.toISOString();
  const rangeEndIso = primarySegment?.rangeEndIso ?? primaryAnchor.toISOString();

  const rangeLabel = useMemo(
    () => formatSegmentLabel(primaryAnchor, viewState.calendarLayout, timeZone),
    [primaryAnchor, timeZone, viewState.calendarLayout],
  );

  const fetchSegmentEvents = useCallback(
    async (anchor: Date, layout: ScheduleCalendarLayout): Promise<ScheduleEvent[]> => {
      const segment = buildScheduleSegment(anchor, layout, [], timeZone);
      const result = await listScheduleEventsAction({
        rangeStart: segment.rangeStartIso,
        rangeEnd: segment.rangeEndIso,
      });
      return result.ok ? result.payload.events : [];
    },
    [timeZone],
  );

  /**
   * Rebuilds the stack around a seed anchor, then viewport-fill is handled by layout effect (PC-489 / PC-492).
   */
  const rebuildStack = useCallback(
    (
      anchorDate: Date,
      opts?: {
        layout?: ScheduleCalendarLayout;
        seedEvents?: ScheduleEvent[];
        scrollToTop?: boolean;
      },
    ) => {
      const layout = opts?.layout ?? viewState.calendarLayout;
      const normalized = normalizeSegmentAnchor(anchorDate, layout, timeZone);
      if (opts?.scrollToTop) {
        scrollTargetAnchorRef.current = normalized.toISOString();
      }
      const seq = ++stackSeqRef.current;
      setPending(true);
      loadingPastRef.current = false;
      loadingFutureRef.current = false;
      setLoadingPast(false);
      setLoadingFuture(false);

      void (async () => {
        try {
          const events =
            opts?.seedEvents ?? (await fetchSegmentEvents(normalized, layout));
          if (seq !== stackSeqRef.current) return;
          setSegments([buildScheduleSegment(normalized, layout, events, timeZone)]);
        } finally {
          if (seq === stackSeqRef.current) setPending(false);
        }
      })();
    },
    [fetchSegmentEvents, timeZone, viewState.calendarLayout],
  );

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

  /** After rebuild, scroll the calendar region to the top (PC-493). */
  useEffect(() => {
    const target = scrollTargetAnchorRef.current;
    if (!target || pending || segments.length === 0) return;
    if (!segments.some((segment) => segment.id === target)) return;
    scrollTargetAnchorRef.current = null;
    requestAnimationFrame(() => {
      scrollRootRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    });
  }, [pending, segments]);

  const refreshCurrentView = useCallback(() => {
    rebuildStack(primaryAnchor, { layout: viewState.calendarLayout });
  }, [primaryAnchor, rebuildStack, viewState.calendarLayout]);

  const appendFutureSegment = useCallback(async () => {
    if (loadingFutureRef.current || pending) return;
    const current = segmentsRef.current;
    if (current.length === 0) return;
    const last = current[current.length - 1];
    if (!last) return;

    const layout = viewState.calendarLayout;
    const maxSegments = scheduleMaxSegments(layout);
    const nextAnchor = shiftSegmentAnchor(new Date(last.anchorIso), layout, 1, timeZone);
    const nextId = nextAnchor.toISOString();
    if (current.some((segment) => segment.id === nextId)) return;

    loadingFutureRef.current = true;
    setLoadingFuture(true);
    const seq = stackSeqRef.current;
    try {
      const events = await fetchSegmentEvents(nextAnchor, layout);
      if (seq !== stackSeqRef.current) return;
      setSegments((prev) => {
        if (prev.some((segment) => segment.id === nextId)) return prev;
        return trimScheduleSegments(
          [...prev, buildScheduleSegment(nextAnchor, layout, events, timeZone)],
          "future",
          maxSegments,
        );
      });
    } finally {
      loadingFutureRef.current = false;
      setLoadingFuture(false);
    }
  }, [fetchSegmentEvents, pending, setSegments, timeZone, viewState.calendarLayout]);

  const prependPastSegment = useCallback(async () => {
    if (loadingPastRef.current || pending) return;
    const current = segmentsRef.current;
    if (current.length === 0) return;
    const first = current[0];
    if (!first) return;

    const layout = viewState.calendarLayout;
    const maxSegments = scheduleMaxSegments(layout);
    const prevAnchor = shiftSegmentAnchor(new Date(first.anchorIso), layout, -1, timeZone);
    const prevId = prevAnchor.toISOString();
    if (current.some((segment) => segment.id === prevId)) return;

    loadingPastRef.current = true;
    setLoadingPast(true);
    const seq = stackSeqRef.current;
    const scrollRoot = scrollRootRef.current;
    const prevScrollHeight = scrollRoot?.scrollHeight ?? 0;
    const prevScrollTop = scrollRoot?.scrollTop ?? 0;
    try {
      const events = await fetchSegmentEvents(prevAnchor, layout);
      if (seq !== stackSeqRef.current) return;
      setSegments((prev) => {
        if (prev.some((segment) => segment.id === prevId)) return prev;
        return trimScheduleSegments(
          [buildScheduleSegment(prevAnchor, layout, events, timeZone), ...prev],
          "past",
          maxSegments,
        );
      });
      // Preserve viewport after prepend (PC-489 / PC-493).
      requestAnimationFrame(() => {
        const root = scrollRootRef.current;
        if (!root) return;
        const delta = root.scrollHeight - prevScrollHeight;
        root.scrollTo(0, prevScrollTop + delta);
      });
    } finally {
      loadingPastRef.current = false;
      setLoadingPast(false);
    }
  }, [fetchSegmentEvents, pending, setSegments, timeZone, viewState.calendarLayout]);

  useEffect(() => {
    saveScheduleViewState(viewState);
  }, [viewState]);

  // Seed stack from SSR week when it matches; otherwise fetch (PC-474 / PC-489).
  useEffect(() => {
    const covers = ssrWeekCoversVisibleRange({
      layout: viewState.calendarLayout,
      visibleAnchor: primaryAnchor,
      ssrWeekStart: new Date(initialWeekStartIso),
      timeZone,
    });
    if (covers) {
      rebuildStack(primaryAnchor, {
        layout: "week",
        seedEvents: initialPayload.events,
      });
      return;
    }
    rebuildStack(primaryAnchor, { layout: viewState.calendarLayout });
    // Mount / layout identity only — avoid thrashing on every primaryAnchor identity churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional seed once per layout change via handlers
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
  }, [openProposal, timeZone]);

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
    if (!sameWeek || viewState.calendarLayout === "month" || viewState.calendarLayout === "day") {
      rebuildStack(anchor, { layout: viewState.calendarLayout });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot per schedule visit
  }, [pathname, rebuildStack, initialWeekStartIso]);

  /** Fill viewport with adjacent segments after seed paint (PC-489). */
  useLayoutEffect(() => {
    if (pending || segments.length === 0 || fillRunningRef.current) return;
    if (segments.length >= SCHEDULE_VIEWPORT_FILL_MAX) return;

    const root = scrollRootRef.current;
    if (!root) return;
    const overflows = root.scrollHeight > root.clientHeight + 48;
    if (overflows) return;

    fillRunningRef.current = true;
    const preferFuture = segments.length % 2 === 1;
    void (async () => {
      try {
        if (preferFuture) await appendFutureSegment();
        else await prependPastSegment();
      } finally {
        fillRunningRef.current = false;
      }
    })();
  }, [appendFutureSegment, pending, prependPastSegment, segments.length]);

  /** Bi-directional infinite scroll sentinels (PC-489 / PC-493). */
  useEffect(() => {
    const root = scrollRootRef.current;
    const top = topSentinelRef.current;
    const bottom = bottomSentinelRef.current;
    if (!root || !top || !bottom) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          if (entry.target === bottom) void appendFutureSegment();
          if (entry.target === top) void prependPastSegment();
        }
      },
      { root, rootMargin: "240px 0px", threshold: 0 },
    );
    observer.observe(top);
    observer.observe(bottom);
    return () => observer.disconnect();
  }, [appendFutureSegment, prependPastSegment, segments.length, viewportHeightPx]);

  const allEvents = useMemo(() => {
    const byId = new Map<string, ScheduleEvent>();
    for (const segment of segments) {
      for (const event of segment.events) byId.set(event.id, event);
    }
    return Array.from(byId.values());
  }, [segments]);

  const filteredAllEvents = useMemo(
    () =>
      filterScheduleEvents(
        allEvents,
        viewState.filterMode,
        currentUserId,
        viewState.filterPersonId || undefined,
        acceptedPartnerIds,
      ),
    [allEvents, viewState.filterMode, viewState.filterPersonId, currentUserId, acceptedPartnerIds],
  );

  function filterSegmentEvents(events: ScheduleEvent[]) {
    return filterScheduleEvents(
      events,
      viewState.filterMode,
      currentUserId,
      viewState.filterPersonId || undefined,
      acceptedPartnerIds,
    );
  }

  function shiftPeriod(delta: number) {
    if (isMonthLayout) {
      const next = shiftSegmentAnchor(monthAnchor, "month", delta, timeZone);
      setViewState((current) => ({ ...current, monthAnchorIso: next.toISOString() }));
      rebuildStack(next, { layout: "month" });
      return;
    }

    if (isDayLayout) {
      const next = shiftSegmentAnchor(dayAnchor, "day", delta, timeZone);
      setViewState((current) => ({
        ...current,
        weekStartIso: next.toISOString(),
        monthAnchorIso: startOfMonth(next, timeZone).toISOString(),
      }));
      rebuildStack(next, { layout: "day" });
      return;
    }

    const next = shiftSegmentAnchor(weekStart, "week", delta, timeZone);
    setViewState((current) => ({
      ...current,
      weekStartIso: next.toISOString(),
      monthAnchorIso: startOfMonth(next, timeZone).toISOString(),
    }));
    rebuildStack(next, { layout: "week" });
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
      rebuildStack(day, { layout: "day", scrollToTop: true });
      return;
    }
    setViewState((current) => ({ ...current, ...anchors }));
    const anchor =
      viewState.calendarLayout === "month"
        ? new Date(anchors.monthAnchorIso)
        : new Date(anchors.weekStartIso);
    rebuildStack(anchor, { layout: viewState.calendarLayout, scrollToTop: true });
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
      rebuildStack(day, { layout: "day", scrollToTop: true });
      return;
    }
    if (layout === "month") {
      const month = startOfMonth(date, timeZone);
      setViewState((current) => ({
        ...current,
        weekStartIso: startOfWeekMonday(date, timeZone).toISOString(),
        monthAnchorIso: month.toISOString(),
      }));
      rebuildStack(month, { layout: "month", scrollToTop: true });
      return;
    }
    const monday = startOfWeekMonday(date, timeZone);
    setViewState((current) => ({
      ...current,
      weekStartIso: monday.toISOString(),
      monthAnchorIso: startOfMonth(date, timeZone).toISOString(),
    }));
    rebuildStack(monday, { layout: "week", scrollToTop: true });
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
    if (mode === "day") {
      const day = startOfLocalDayNoon(
        viewState.calendarLayout === "month" ? monthAnchor : new Date(viewState.weekStartIso),
        timeZone,
      );
      const withDay = { ...next, weekStartIso: day.toISOString() };
      setViewState(withDay);
      rebuildStack(day, { layout: "day" });
      return;
    }
    if (mode === "month") {
      const fromWeek = startOfMonth(new Date(viewState.weekStartIso), timeZone);
      const withMonth = { ...next, monthAnchorIso: fromWeek.toISOString() };
      setViewState(withMonth);
      rebuildStack(fromWeek, { layout: "month" });
      return;
    }
    setViewState(next);
    rebuildStack(startOfWeekMonday(new Date(next.weekStartIso), timeZone), {
      layout: "week",
    });
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
      weekStartIso: monday.toISOString(),
      monthAnchorIso: day.toISOString(),
    }));
    rebuildStack(monday, { layout: "week" });
  }

  function createForDay(day: Date, lockedType: "event" | "sleeping") {
    const start = new Date(day);
    start.setHours(lockedType === "event" ? 10 : 0, 0, 0, 0);
    setDaySheetDay(null);
    openCreate({ lockedType, initialStartAt: start.toISOString() });
  }

  const showAgenda = !isMonthLayout && !isDayLayout && isMobile;

  const filterLabel = (() => {
    if (viewState.filterMode === "solo") return "Solo";
    if (viewState.filterMode === "sleeping_network") return "Sleeping network";
    if (viewState.filterMode === "person") {
      const person = people.find((p) => p.id === viewState.filterPersonId);
      return person?.displayName ? person.displayName : "Person";
    }
    return "Whole Network";
  })();

  const primaryFiltered = primarySegment
    ? filterSegmentEvents(primarySegment.events)
    : filteredAllEvents;

  const datePopoverOpen = Boolean(dateAnchorEl);

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
      data-segment-count={segments.length}
      aria-busy={pending || loadingPast || loadingFuture}
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
            <Chip
              label="Goto Today"
              size="small"
              clickable
              onClick={goToday}
              disabled={pending}
              aria-label="Goto today"
              color="primary"
              variant="outlined"
            />
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
              <ToggleButton value="day">Daily</ToggleButton>
              <ToggleButton value="week">Weekly</ToggleButton>
              <ToggleButton value="month">Monthly</ToggleButton>
            </ToggleButtonGroup>

            <FormControl size="small" sx={{ minWidth: 148 }}>
              <InputLabel id="schedule-filter-inline-label">Network</InputLabel>
              <Select
                labelId="schedule-filter-inline-label"
                label="Network"
                value={viewState.filterMode}
                onChange={(event) => {
                  const mode = event.target.value as ScheduleFilterMode;
                  setViewState((current) => ({
                    ...current,
                    filterMode: mode,
                    filterPersonId: mode === "person" ? current.filterPersonId : "",
                  }));
                }}
                renderValue={() => filterLabel}
                data-testid="schedule-network-filter"
                aria-label="Network filter"
              >
                <MenuItem value="whole">Whole Network</MenuItem>
                <MenuItem value="solo">Solo</MenuItem>
                <MenuItem value="sleeping_network">Sleeping network</MenuItem>
                <MenuItem value="person">Specific person</MenuItem>
              </Select>
            </FormControl>

            {viewState.filterMode === "person" && (
              <FormControl size="small" sx={{ minWidth: 140 }}>
                <InputLabel id="schedule-person-inline-label">Person</InputLabel>
                <Select
                  labelId="schedule-person-inline-label"
                  label="Person"
                  value={viewState.filterPersonId}
                  onChange={(event) =>
                    setViewState((current) => ({
                      ...current,
                      filterPersonId: event.target.value,
                    }))
                  }
                  data-testid="schedule-person-filter"
                  aria-label="Person filter"
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
          </Stack>
        </Stack>
      </Box>

      <Popover
        open={datePopoverOpen}
        anchorEl={dateAnchorEl}
        onClose={() => setDateAnchorEl(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        slotProps={{ paper: { sx: { ...brutalPopoverPaperSx, p: 2, width: 320 } } }}
      >
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
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
          opacity: pending ? 0.72 : 1,
          transition: "opacity 120ms ease",
        }}
      >
        <ScheduleHeatmap
          events={primaryFiltered}
          weekStartIso={isDayLayout ? dayAnchor.toISOString() : rangeStartIso}
          dayCount={dayCount}
          timeZone={timeZone}
          layout={isMonthLayout ? "month" : isDayLayout ? "day" : "week"}
        />

        {loadingPast ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 1 }} aria-live="polite">
            <CircularProgress size={20} aria-label="Loading earlier dates" />
          </Box>
        ) : null}
        <Box
          ref={topSentinelRef}
          data-testid="schedule-scroll-top"
          aria-hidden
          sx={{ height: 1 }}
        />

        <Stack spacing={3}>
          {segments.map((segment) => {
            const anchor = new Date(segment.anchorIso);
            const events = filterSegmentEvents(segment.events);
            const label = formatSegmentLabel(anchor, viewState.calendarLayout, timeZone);
            return (
              <Box
                key={segment.id}
                data-testid="schedule-segment"
                data-segment-anchor={segment.anchorIso}
                sx={{ scrollMarginTop: 8 }}
              >
                <Typography
                  variant="subtitle2"
                  color="text.secondary"
                  sx={{ mb: 1, fontWeight: 600 }}
                >
                  {label}
                </Typography>
                {isMonthLayout ? (
                  <ScheduleMonthView
                    monthAnchor={anchor}
                    events={events}
                    timeZone={timeZone}
                    onEventClick={openScheduleEvent}
                    onDayClick={openDaySheet}
                  />
                ) : isDayLayout ? (
                  <ScheduleDayView
                    day={anchor}
                    events={events}
                    timeZone={timeZone}
                    onEventClick={openScheduleEvent}
                  />
                ) : showAgenda ? (
                  <ScheduleAgendaView
                    weekStart={anchor}
                    dayCount={7}
                    events={events}
                    timeZone={timeZone}
                    onEventClick={openScheduleEvent}
                    onDayHeaderClick={openDaySheet}
                    onDayOverflowClick={openDaySheet}
                  />
                ) : (
                  <ScheduleWeekView
                    weekStart={anchor}
                    dayCount={7}
                    events={events}
                    compact={false}
                    timeZone={timeZone}
                    onEventClick={openScheduleEvent}
                  />
                )}
              </Box>
            );
          })}
        </Stack>

        <Box
          ref={bottomSentinelRef}
          data-testid="schedule-scroll-bottom"
          aria-hidden
          sx={{ height: 1 }}
        />
        {loadingFuture ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 1 }} aria-live="polite">
            <CircularProgress size={20} aria-label="Loading later dates" />
          </Box>
        ) : null}
      </Box>

      <ScheduleDaySheet
        open={Boolean(daySheetDay)}
        day={daySheetDay}
        events={filteredAllEvents}
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
