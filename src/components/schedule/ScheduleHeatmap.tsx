"use client";

import { Box, Tooltip, Typography } from "@mui/material";
import { useMemo } from "react";

import type { ScheduleEvent } from "@/actions/schedule";
import { addDays, startOfWeekMonday } from "@/lib/schedule/dates";

const LEVEL_COLORS = ["#e8f5e9", "#fff9c4", "#ffe0b2", "#ffcdd2"];

/**
 * Privacy-safe busyness strip — counts visible events per day without exposing details (PC-53).
 */
export function ScheduleHeatmap({
  events,
  weekStartIso,
  dayCount,
}: {
  events: ScheduleEvent[];
  weekStartIso: string;
  dayCount: number;
}) {
  const weekStart = useMemo(() => startOfWeekMonday(new Date(weekStartIso)), [weekStartIso]);

  const levels = useMemo(() => {
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
  }, [events, weekStart, dayCount]);

  return (
    <Box sx={{ mb: 1.5 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
        Network busyness (detail hidden)
      </Typography>
      <Box
        role="img"
        aria-label="Weekly busyness heatmap"
        sx={{
          display: "grid",
          gridTemplateColumns: `repeat(${dayCount}, 1fr)`,
          gap: 0.5,
          height: 12,
        }}
      >
        {levels.map((level, index) => {
          const day = addDays(weekStart, index);
          const label = day.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
          return (
            <Tooltip key={label} title={`${label}: ${level === 0 ? "open" : level === 3 ? "very busy" : "busy"}`}>
              <Box
                sx={{
                  borderRadius: 0.5,
                  bgcolor: LEVEL_COLORS[level],
                  border: "1px solid",
                  borderColor: "divider",
                }}
              />
            </Tooltip>
          );
        })}
      </Box>
    </Box>
  );
}
