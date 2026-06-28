"use client";

import { Box, Tooltip, Typography } from "@mui/material";
import { useMemo } from "react";

import type { ScheduleEvent } from "@/actions/schedule";
import { addDays, isPastDate, isTodayDate, startOfWeekMonday } from "@/lib/schedule/dates";

const LEVEL_COLORS = ["#e8f5e9", "#fff9c4", "#ffe0b2", "#ffcdd2"];

export type HeatmapLayout = "week" | "twoWeek" | "month";

/** Formats a day label as MM/DD for heatmap cells. */
function formatHeatmapDate(day: Date): string {
  const mm = String(day.getMonth() + 1).padStart(2, "0");
  const dd = String(day.getDate()).padStart(2, "0");
  return `${mm}/${dd}`;
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
function HeatmapCell({ level, day, compact = false, timeZone = "UTC" }: HeatmapCellProps) {
  const label = formatHeatmapDate(day);
  const busyLabel = level === 0 ? "open" : level === 3 ? "very busy" : "busy";
  const isToday = isTodayDate(day, timeZone);
  const isPast = isPastDate(day, timeZone);
  return (
    <Tooltip
      title={`${day.toLocaleDateString(undefined, { weekday: "short" })} ${label}: ${busyLabel}${isToday ? " (today)" : ""}`}
    >
      <Box
        sx={{
          borderRadius: 0.5,
          bgcolor: LEVEL_COLORS[level],
          border: "1px solid",
          borderColor: isToday ? "primary.main" : "divider",
          minHeight: compact ? 18 : 28,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: compact ? "0.6rem" : "0.65rem",
          fontWeight: isToday ? 700 : 600,
          color: isPast ? "text.disabled" : "text.secondary",
          opacity: isPast ? 0.55 : 1,
        }}
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
  timeZone = "UTC",
}: {
  events: ScheduleEvent[];
  weekStartIso: string;
  dayCount: number;
  layout?: HeatmapLayout;
  timeZone?: string;
}) {
  const weekStart = useMemo(() => startOfWeekMonday(new Date(weekStartIso)), [weekStartIso]);

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
                    key={`${dayIndex}-${formatHeatmapDate(day)}`}
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
