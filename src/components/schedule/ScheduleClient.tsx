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
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";

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

const POLY_GREEN = "#004d40";

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
  const [viewState, setViewState] = useState<ScheduleViewState>(() => ({
    ...loadScheduleViewState(),
    weekStartIso: initialWeekStartIso,
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
  const dayCount = viewState.compact ? 14 : 7;
  const rangeEnd = useMemo(() => {
    if (viewState.compact) {
      const end = addDays(weekStart, 13);
      end.setHours(23, 59, 59, 999);
      return end;
    }
    return endOfWeekSunday(weekStart);
  }, [viewState.compact, weekStart]);

  const rangeLabel = useMemo(() => {
    const end = addDays(weekStart, dayCount - 1);
    const fmt: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
    return `${weekStart.toLocaleDateString(undefined, fmt)} – ${end.toLocaleDateString(undefined, fmt)}`;
  }, [weekStart, dayCount]);

  const refreshSchedule = useCallback(
    (nextWeekStart: Date) => {
      const monday = startOfWeekMonday(nextWeekStart);
      const end = viewState.compact ? addDays(monday, 13) : endOfWeekSunday(monday);
      if (viewState.compact) end.setHours(23, 59, 59, 999);

      startTransition(async () => {
        const result = await listScheduleEventsAction({
          rangeStart: monday.toISOString(),
          rangeEnd: end.toISOString(),
        });
        if (result.ok) setPayload(result.payload);
      });
    },
    [viewState.compact],
  );

  useEffect(() => {
    saveScheduleViewState(viewState);
  }, [viewState]);

  useEffect(() => {
    const monday = startOfWeekMonday(new Date(initialWeekStartIso));
    setViewState((current) => ({ ...current, weekStartIso: monday.toISOString() }));
    setPayload(initialPayload);
  }, [initialWeekStartIso, initialPayload]);

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

  function shiftWeek(delta: number) {
    const step = viewState.compact ? 14 : 7;
    const next = addDays(weekStart, delta * step);
    setViewState((current) => ({ ...current, weekStartIso: next.toISOString() }));
    refreshSchedule(next);
  }

  function openProposal(proposalId: string) {
    setSelectedProposalId(proposalId);
    setDetailOpen(true);
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
          <IconButton aria-label="Previous period" onClick={() => shiftWeek(-1)} disabled={pending}>
            <ChevronLeftIcon />
          </IconButton>
          <Typography variant="subtitle1" fontWeight={600}>
            {rangeLabel}
          </Typography>
          <IconButton aria-label="Next period" onClick={() => shiftWeek(1)} disabled={pending}>
            <ChevronRightIcon />
          </IconButton>
        </Stack>

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
            ...(viewState.planningOpen && {
              bgcolor: POLY_GREEN,
              color: "#fff",
              "&:hover": { bgcolor: "#00695c" },
            }),
          }}
        >
          <EventNoteIcon sx={{ mr: 0.5, fontSize: 18 }} />
          Planning
        </ToggleButton>
      </Stack>

      <Stack direction="row" spacing={2} sx={{ mb: 1 }} flexWrap="wrap" useFlexGap>
        <Typography variant="caption">■ Proposed</Typography>
        <Typography variant="caption" color="#2e7d32">
          ■ Approved events
        </Typography>
        <Typography variant="caption" color="#1565c0">
          ■ Sleeping
        </Typography>
        <Typography variant="caption" color="#c62828">
          ■ Conflict
        </Typography>
        <Typography variant="caption" color="#e65100">
          ■ At risk / tentative
        </Typography>
      </Stack>
      </Box>

      <ScheduleHeatmap
        events={filteredEvents}
        weekStartIso={viewState.weekStartIso}
        dayCount={dayCount}
      />

      <ScheduleWeekView
        weekStart={weekStart}
        dayCount={dayCount}
        events={filteredEvents}
        compact={viewState.compact}
        timeZone={timeZone}
        onEventClick={openProposal}
      />

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
          router.refresh();
          refreshSchedule(weekStart);
        }}
        onEdit={handleEditFromDetail}
        people={people}
      />

      <ProposalDraftDialog
        open={draftOpen}
        onClose={() => {
          setDraftOpen(false);
          setEditDetail(null);
          router.refresh();
          refreshSchedule(weekStart);
        }}
        people={people}
        places={places}
        currentUserId={currentUserId}
        initialDetail={editDetail}
      />
    </Box>
  );
}
