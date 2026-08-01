"use client";

import { Box, Tooltip, Typography } from "@mui/material";
import { useMemo } from "react";

import type { ScheduleEvent } from "@/actions/schedule";
import {
  addDays,
  civilDateAtNoonUtc,
  isPastDate,
  isTodayDate,
  localDateKey,
  startOfWeekMonday,
} from "@/lib/schedule/dates";
import { DEFAULT_VIEWER_TIMEZONE } from "@/lib/schedule/timezone";
import { GARDEN_TOKENS, HEATMAP_LEVEL_COLORS } from "@/theme/tokens";

const LEVEL_COLORS = [...HEATMAP_LEVEL_COLORS];

export type HeatmapLayout = "day" | "week" | "twoWeek" | "month";

/** Formats a day label as MM/DD for heatmap cells in the viewer timezone. */
function formatHeatmapDate(day: Date, timeZone: string = DEFAULT_VIEWER_TIMEZONE): string {
  const key = localDateKey(day.toISOString(), timeZone);
  return `${key.slice(5, 7)}/${key.slice(8, 10)}`;
}

function computeBusynessLevels(
  events: ScheduleEvent[],
  weekStart: Date,
  dayCount: number,
): number[] {
  const counts = Array.from({ length: dayCount }, () => 0);
  for (const event of events) {
    if (!event.startAt) continue;
    const start = new Date(event.startAt);
    for (let index = 0; index < dayCount; index += 1) {
      const day = addDays(weekStart, index);
      const dayStart = new Date(day);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = addDays(dayStart, 1);
      const eventEnd = event.endAt
        ? new Date(event.endAt)
        : new Date(start.getTime() + 60 * 60 * 1000);
      if (start < dayEnd && eventEnd > dayStart) {
        counts[index] += 1;
      }
    }
  }
  return counts.map((count) => {
    if (count === 0) return 0;
    if (count === 1) return 1;
    if (count <= 3) return 2;
    return 3;
  });
}

interface HeatmapCellProps {
  level: number;
  day: Date;
  compact?: boolean;
  timeZone?: string;
}

/** Single busyness cell with DD/MM label (PC-56, PC-59 past/today styling). */
function HeatmapCell({ level, day, compact = false, timeZone = DEFAULT_VIEWER_TIMEZONE }: HeatmapCellProps) {
  const label = formatHeatmapDate(day, timeZone);
  const busyLabel = level === 0 ? "open" : level === 3 ? "very busy" : "busy";
  const isToday = isTodayDate(day, timeZone);
  const isPast = isPastDate(day, timeZone);
  return (
    <Tooltip
      title={`${day.toLocaleDateString(undefined, { weekday: "short", timeZone })} ${label}: ${busyLabel}${isToday ? " (today)" : ""}`}
    >
      <Box
        sx={{
          borderRadius: 0.5,
          bgcolor: isToday ? GARDEN_TOKENS.todayHighlight : LEVEL_COLORS[level],
          border: "1px solid",
          borderColor: isToday ? GARDEN_TOKENS.sage : GARDEN_TOKENS.outlineSoft,
          minHeight: compact ? 18 : 28,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: compact ? "0.6rem" : "0.65rem",
          fontWeight: isToday ? 700 : 600,
          color: isPast ? GARDEN_TOKENS.inkMuted : GARDEN_TOKENS.ink,
          opacity: isPast ? 0.55 : 1,
          outline: "none",
          "&:focus-visible": {
            boxShadow: `0 0 0 2px ${GARDEN_TOKENS.ink}`,
          },
        }}
        tabIndex={0}
        role="img"
        aria-label={`${day.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric", timeZone })}: ${busyLabel}${isToday ? ", today" : ""}`}
      >
        {label}
      </Box>
    </Tooltip>
  );
}

/**
 * Privacy-safe busyness strip — counts visible events per day without exposing titles (PC-56).
 */
export function ScheduleHeatmap({
  events,
  weekStartIso,
  dayCount,
  layout = "week",
  timeZone = DEFAULT_VIEWER_TIMEZONE,
}: {
  events: ScheduleEvent[];
  weekStartIso: string;
  dayCount: number;
  layout?: HeatmapLayout;
  timeZone?: string;
}) {
  const weekStart = useMemo(() => {
    const anchor = new Date(weekStartIso);
    if (layout === "day") {
      return civilDateAtNoonUtc(localDateKey(anchor.toISOString(), timeZone ?? DEFAULT_VIEWER_TIMEZONE));
    }
    return startOfWeekMonday(anchor, timeZone);
  }, [layout, weekStartIso, timeZone]);

  const levels = useMemo(
    () => computeBusynessLevels(events, weekStart, dayCount),
    [events, weekStart, dayCount],
  );

  if (layout === "month") {
    return null;
  }

  const columns = layout === "twoWeek" ? 7 : dayCount;
  const rows = layout === "twoWeek" ? 2 : 1;

  return (
    <Box sx={{ mb: 1.5 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
        Network busyness
      </Typography>
      <Box
        role="img"
        aria-label="Network busyness heatmap"
        sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}
      >
        {Array.from({ length: rows }, (_, rowIndex) => (
          <Box
            key={`heatmap-row-${rowIndex}`}
            sx={{
              display: "grid",
              gridTemplateColumns: `repeat(${columns}, 1fr)`,
              gap: 0.5,
            }}
          >
            {levels
              .slice(rowIndex * columns, rowIndex * columns + columns)
              .map((level, colIndex) => {
                const dayIndex = rowIndex * columns + colIndex;
                const day = addDays(weekStart, dayIndex);
                return (
                  <HeatmapCell
                    key={`${dayIndex}-${formatHeatmapDate(day, timeZone ?? DEFAULT_VIEWER_TIMEZONE)}`}
                    level={level}
                    day={day}
                    compact={layout === "twoWeek"}
                    timeZone={timeZone}
                  />
                );
              })}
          </Box>
        ))}
      </Box>
    </Box>
  );
}

/** Busyness level for a single calendar day — used in month view cells (PC-56). */
export function busynessLevelForDay(events: ScheduleEvent[], day: Date): number {
  const levels = computeBusynessLevels(events, day, 1);
  return levels[0] ?? 0;
}

export { LEVEL_COLORS, formatHeatmapDate };
