"use client";

import EventIcon from "@mui/icons-material/Event";
import NightsStayIcon from "@mui/icons-material/NightsStay";
import { Box, Typography } from "@mui/material";
import { useMemo } from "react";

import type { ScheduleEvent } from "@/actions/schedule";
import {
  LEVEL_COLORS,
  busynessLevelForDay,
  formatHeatmapDate,
} from "@/components/schedule/ScheduleHeatmap";
import {
  buildMonthGrid,
  eventSpanInGrid,
  startOfMonth,
} from "@/lib/schedule/month-grid";
import { localDateKey, scheduleDayCellSx, isTodayDate } from "@/lib/schedule/dates";

interface ScheduleMonthViewProps {
  monthAnchor: Date;
  events: ScheduleEvent[];
  timeZone?: string;
  onEventClick: (proposalId: string) => void;
  /** Switches to week view anchored on the clicked day (PC-56). */
  onDayClick?: (day: Date) => void;
}

interface SpanBar {
  key: string;
  proposalId: string;
  title: string;
  proposalType: ScheduleEvent["proposalType"];
  weekRow: number;
  startCol: number;
  endCol: number;
  isContentMasked: boolean;
}

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Month calendar with day icons and multi-day span bars (PC-55).
 */
export function ScheduleMonthView({
  monthAnchor,
  events,
  timeZone = "UTC",
  onEventClick,
  onDayClick,
}: ScheduleMonthViewProps) {
  const grid = useMemo(() => buildMonthGrid(monthAnchor), [monthAnchor]);
  const monthStart = startOfMonth(monthAnchor);
  const monthKey = `${monthStart.getFullYear()}-${monthStart.getMonth()}`;

  const eventsByDay = useMemo(() => {
    const map = new Map<string, { hasEvent: boolean; hasSleeping: boolean }>();
    for (const day of grid) {
      map.set(localDateKey(day.toISOString(), timeZone), { hasEvent: false, hasSleeping: false });
    }
    for (const event of events) {
      const span = eventSpanInGrid(grid, event.startAt, event.endAt, timeZone);
      if (!span) continue;
      for (let index = span.startIndex; index <= span.endIndex; index += 1) {
        const key = localDateKey(grid[index]!.toISOString(), timeZone);
        const entry = map.get(key);
        if (!entry) continue;
        if (event.proposalType === "sleeping") entry.hasSleeping = true;
        else entry.hasEvent = true;
      }
    }
    return map;
  }, [grid, events, timeZone]);

  const spanBars = useMemo(() => {
    const bars: SpanBar[] = [];
    const seen = new Set<string>();

    for (const event of events) {
      const span = eventSpanInGrid(grid, event.startAt, event.endAt, timeZone);
      if (!span) continue;
      const dedupeKey = `${event.proposalId}:${span.startIndex}:${span.endIndex}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      const weekRow = Math.floor(span.startIndex / 7);
      bars.push({
        key: dedupeKey,
        proposalId: event.proposalId,
        title: event.title,
        proposalType: event.proposalType,
        weekRow,
        startCol: (span.startIndex % 7) + 1,
        endCol: (span.endIndex % 7) + 2,
        isContentMasked: event.isContentMasked,
      });
    }
    return bars;
  }, [events, grid, timeZone]);

  const weeks = useMemo(() => {
    const rows: Date[][] = [];
    for (let index = 0; index < grid.length; index += 7) {
      rows.push(grid.slice(index, index + 7));
    }
    return rows;
  }, [grid]);

  return (
    <Box sx={{ mt: 1 }}>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: 0.5,
          mb: 0.5,
        }}
      >
        {WEEKDAY_LABELS.map((label) => (
          <Typography
            key={label}
            variant="caption"
            fontWeight={600}
            color="text.secondary"
            textAlign="center"
          >
            {label}
          </Typography>
        ))}
      </Box>

      {weeks.map((week, weekIndex) => (
        <Box key={`week-${monthKey}-${weekIndex}`} sx={{ position: "relative", mb: 0.5 }}>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              gap: 0.5,
              minHeight: 72,
            }}
          >
            {week.map((day) => {
              const key = localDateKey(day.toISOString(), timeZone);
              const markers = eventsByDay.get(key);
              const inMonth = day.getMonth() === monthStart.getMonth();
              const busynessLevel = busynessLevelForDay(events, day);
              const busynessLabel =
                busynessLevel === 0 ? "open" : busynessLevel === 3 ? "very busy" : "busy";
              const daySx = scheduleDayCellSx(day, timeZone);
              const isToday = isTodayDate(day, timeZone);

              return (
                <Box
                  key={key}
                  component={onDayClick ? "button" : "div"}
                  type={onDayClick ? "button" : undefined}
                  onClick={onDayClick ? () => onDayClick(day) : undefined}
                  sx={{
                    border: 1,
                    borderColor: daySx.borderColor,
                    borderRadius: 1,
                    p: 0.5,
                    bgcolor: inMonth ? daySx.bgcolor : "action.hover",
                    opacity: inMonth ? daySx.opacity : 0.45,
                    minHeight: 72,
                    position: "relative",
                    textAlign: "left",
                    cursor: onDayClick ? "pointer" : "default",
                    width: "100%",
                  }}
                >
                  <Box
                    sx={{
                      position: "absolute",
                      top: 4,
                      right: 4,
                      width: 14,
                      height: 14,
                      borderRadius: 0.5,
                      bgcolor: LEVEL_COLORS[busynessLevel],
                      border: "1px solid",
                      borderColor: "divider",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "0.45rem",
                      fontWeight: 600,
                      color: "text.secondary",
                      lineHeight: 1,
                    }}
                    aria-label={`Network busyness: ${busynessLabel}`}
                  >
                    {formatHeatmapDate(day)}
                  </Box>
                  <Typography
                    variant="caption"
                    fontWeight={isToday ? 800 : 600}
                    color={isToday ? "primary.main" : "text.primary"}
                    display="block"
                  >
                    {day.getDate()}
                  </Typography>
                  <Box sx={{ display: "flex", gap: 0.25, mt: 0.25 }}>
                    {markers?.hasEvent && (
                      <EventIcon sx={{ fontSize: 14, color: "#2e7d32" }} aria-label="Event" />
                    )}
                    {markers?.hasSleeping && (
                      <NightsStayIcon sx={{ fontSize: 14, color: "#1565c0" }} aria-label="Sleeping" />
                    )}
                  </Box>
                </Box>
              );
            })}
          </Box>

          <Box
            sx={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 22,
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              gap: 0.5,
              pointerEvents: "none",
            }}
          >
            {spanBars
              .filter((bar) => bar.weekRow === weekIndex)
              .map((bar) => (
                <Box
                  key={bar.key}
                  component="button"
                  type="button"
                  onClick={() => onEventClick(bar.proposalId)}
                  sx={{
                    gridColumn: `${bar.startCol} / ${bar.endCol}`,
                    pointerEvents: "auto",
                    border: "none",
                    cursor: "pointer",
                    borderRadius: 1,
                    px: 0.5,
                    py: 0.25,
                    fontSize: "0.65rem",
                    textAlign: "left",
                    color: "#fff",
                    bgcolor: bar.proposalType === "sleeping" ? "#1565c0" : "#2e7d32",
                    opacity: bar.isContentMasked ? 0.7 : 1,
                    overflow: "hidden",
                    whiteSpace: "nowrap",
                    textOverflow: "ellipsis",
                  }}
                  title={bar.title}
                >
                  {bar.isContentMasked ? "Busy" : bar.title}
                </Box>
              ))}
          </Box>
        </Box>
      ))}
    </Box>
  );
}
