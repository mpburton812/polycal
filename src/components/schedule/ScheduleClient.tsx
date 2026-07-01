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
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";

import { getProposalDetailAction } from "@/actions/proposals";
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
  type ScheduleViewState,
} from "@/components/schedule/scheduleViewState";
import { ProposalDetailDialog } from "@/components/proposals/ProposalDetailDialog";
import { ProposalDraftDialog } from "@/components/proposals/ProposalDraftDialog";
import type { ProposalDetail } from "@/actions/proposals";
import { filterScheduleEvents } from "@/lib/schedule/filters";
import {
  addDays,
  endOfWeekSunday,
  startOfWeekMonday,
} from "@/lib/schedule/dates";
import { endOfMonth, startOfMonth } from "@/lib/schedule/month-grid";
import { GARDEN_TOKENS, SCHEDULE_SEMANTIC_COLORS } from "@/theme/tokens";

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
  const router = useRouter();
  const pathname = usePathname();
  const previousPathRef = useRef<string | null>(null);
  const initialPayloadHydratedRef = useRef(false);
  const [viewState, setViewState] = useState<ScheduleViewState>(() => ({
    ...loadScheduleViewState(),
    weekStartIso: initialWeekStartIso,
    monthAnchorIso: initialWeekStartIso,
  }));
  const [payload, setPayload] = useState<SchedulePayload>(initialPayload);
  const [pending, startTransition] = useTransition();
  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editDetail, setEditDetail] = useState<ProposalDetail | null>(null);
  const [draftOpen, setDraftOpen] = useState(false);

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
    if (isMonthLayout) {
      return endOfMonth(monthAnchor);
    }
    if (viewState.compact) {
      const end = addDays(weekStart, 13);
      end.setHours(23, 59, 59, 999);
      return end;
    }
    return endOfWeekSunday(weekStart);
  }, [isMonthLayout, monthAnchor, viewState.compact, weekStart]);

  const rangeStart = useMemo(() => {
    if (isMonthLayout) {
      return startOfWeekMonday(startOfMonth(monthAnchor));
    }
    return weekStart;
  }, [isMonthLayout, monthAnchor, weekStart]);

  const rangeLabel = useMemo(() => {
    if (isMonthLayout) {
      return monthAnchor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    }
    const end = addDays(weekStart, dayCount - 1);
    const fmt: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
    return `${weekStart.toLocaleDateString(undefined, fmt)} – ${end.toLocaleDateString(undefined, fmt)}`;
  }, [dayCount, isMonthLayout, monthAnchor, weekStart]);

  const refreshSchedule = useCallback(
    (anchorDate: Date) => {
      const monday = isMonthLayout
        ? startOfWeekMonday(startOfMonth(anchorDate))
        : startOfWeekMonday(anchorDate);
      const end = isMonthLayout
        ? endOfMonth(anchorDate)
        : viewState.compact
          ? addDays(monday, 13)
          : endOfWeekSunday(monday);
      if (!isMonthLayout && viewState.compact) end.setHours(23, 59, 59, 999);

      startTransition(async () => {
        const result = await listScheduleEventsAction({
          rangeStart: monday.toISOString(),
          rangeEnd: end.toISOString(),
        });
        if (result.ok) setPayload(result.payload);
      });
    },
    [isMonthLayout, viewState.compact],
  );

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
   * Opening Schedule (mount or navigation) always anchors on the current week (PC-55).
   * Uses client "today" so cached server props cannot leave the calendar on an old week.
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
      refreshSchedule(monday);
    }

    previousPathRef.current = pathname;
  }, [pathname, refreshSchedule]);

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
      refreshSchedule(next);
      return;
    }

    const step = viewState.compact ? 14 : 7;
    const next = addDays(weekStart, delta * step);
    setViewState((current) => ({ ...current, weekStartIso: next.toISOString() }));
    refreshSchedule(next);
  }

  function goToToday() {
    const today = startOfWeekMonday(new Date());
    setViewState((current) => ({
      ...current,
      weekStartIso: today.toISOString(),
      monthAnchorIso: today.toISOString(),
    }));
    refreshSchedule(today);
  }

  function openProposal(proposalId: string) {
    setSelectedProposalId(proposalId);
    setDetailOpen(true);
  }

  function handleMonthDayClick(day: Date) {
    const monday = startOfWeekMonday(day);
    setViewState((current) => ({
      ...current,
      calendarLayout: "week",
      weekStartIso: monday.toISOString(),
      monthAnchorIso: day.toISOString(),
    }));
    refreshSchedule(monday);
  }

  function handleEditFromDetail(detail: ProposalDetail) {
    setDetailOpen(false);
    setEditDetail(detail);
    setDraftOpen(true);
  }

  return (
    <Box sx={{ pb: 2 }}>
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
              refreshSchedule(value === "month" ? monthAnchor : weekStart);
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
                const monday = startOfWeekMonday(weekStart);
                const end = compact ? addDays(monday, 13) : endOfWeekSunday(monday);
                if (compact) end.setHours(23, 59, 59, 999);
                startTransition(async () => {
                  const result = await listScheduleEventsAction({
                    rangeStart: monday.toISOString(),
                    rangeEnd: end.toISOString(),
                  });
                  if (result.ok) setPayload(result.payload);
                });
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
        <Typography variant="caption" sx={{ color: SCHEDULE_SEMANTIC_COLORS.proposed.text }}>
          ■ Proposed
        </Typography>
        <Typography variant="caption" sx={{ color: SCHEDULE_SEMANTIC_COLORS.resolved_event.text }}>
          ■ Approved events
        </Typography>
        <Typography variant="caption" sx={{ color: SCHEDULE_SEMANTIC_COLORS.resolved_sleeping.text }}>
          ■ Sleeping
        </Typography>
        <Typography variant="caption" sx={{ color: SCHEDULE_SEMANTIC_COLORS.conflict.text }}>
          ■ Conflict
        </Typography>
        <Typography variant="caption" sx={{ color: SCHEDULE_SEMANTIC_COLORS.at_risk.text }}>
          ■ At risk / tentative
        </Typography>
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
          onEventClick={openProposal}
          onDayClick={handleMonthDayClick}
        />
      ) : (
        <ScheduleWeekView
          weekStart={weekStart}
          dayCount={dayCount}
          events={filteredEvents}
          compact={viewState.compact}
          timeZone={timeZone}
          onEventClick={openProposal}
        />
      )}

      <PlanningModeDrawer
        open={viewState.planningOpen}
        items={payload.planningItems}
        onClose={() => setViewState((current) => ({ ...current, planningOpen: false }))}
        onSelect={(id) => {
          openProposal(id);
          setViewState((current) => ({ ...current, planningOpen: false }));
        }}
      />

      <ProposalDetailDialog
        proposalId={selectedProposalId}
        open={detailOpen}
        onClose={() => {
          setDetailOpen(false);
          setSelectedProposalId(null);
          refreshSchedule(isMonthLayout ? monthAnchor : weekStart);
        }}
        onEdit={handleEditFromDetail}
        people={people}
      />

      <ProposalDraftDialog
        open={draftOpen}
        onClose={() => {
          setDraftOpen(false);
          setEditDetail(null);
          refreshSchedule(isMonthLayout ? monthAnchor : weekStart);
        }}
        people={people}
        places={places}
        currentUserId={currentUserId}
        initialDetail={editDetail}
      />
    </Box>
  );
}
