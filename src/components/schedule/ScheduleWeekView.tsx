"use client";

import { Box, Typography } from "@mui/material";
import { useMemo } from "react";

import type { ScheduleEvent } from "@/actions/schedule";
import { ScheduleEventBlock } from "@/components/schedule/ScheduleEventBlock";
import {
  addDays,
  formatDayHeader,
  localDateKey,
  startOfWeekMonday,
} from "@/lib/schedule/dates";

interface ScheduleWeekViewProps {
  weekStart: Date;
  dayCount: number;
  events: ScheduleEvent[];
  compact: boolean;
  onEventClick: (proposalId: string) => void;
}

/**
 * Renders a multi-day column grid with events grouped by local day (PC-42).
 */
export function ScheduleWeekView({
  weekStart,
  dayCount,
  events,
  compact,
  onEventClick,
}: ScheduleWeekViewProps) {
  const days = useMemo(() => {
    const monday = startOfWeekMonday(weekStart);
    return Array.from({ length: dayCount }, (_, index) => addDays(monday, index));
  }, [weekStart, dayCount]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, ScheduleEvent[]>();
    for (const day of days) {
      map.set(localDateKey(day.toISOString()), []);
    }
    for (const event of events) {
      const key = localDateKey(event.startAt);
      const list = map.get(key);
      if (list) list.push(event);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.startAt.localeCompare(b.startAt));
    }
    return map;
  }, [days, events]);

  if (compact) {
    return (
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {days.map((day) => {
          const key = localDateKey(day.toISOString());
          const dayEvents = eventsByDay.get(key) ?? [];
          return (
            <Box
              key={key}
              sx={{
                display: "flex",
                alignItems: "flex-start",
                gap: 1,
                py: 0.5,
                borderBottom: 1,
                borderColor: "divider",
              }}
            >
              <Typography
                variant="caption"
                sx={{ minWidth: 72, fontWeight: 600, color: "text.secondary" }}
              >
                {formatDayHeader(day)}
              </Typography>
              <Box sx={{ flex: 1, display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                {dayEvents.length === 0 ? (
                  <Typography variant="caption" color="text.disabled">
                    —
                  </Typography>
                ) : (
                  dayEvents.map((event) => (
                    <Box key={event.id} sx={{ minWidth: 120, maxWidth: 220, flex: "1 1 120px" }}>
                      <ScheduleEventBlock
                        event={event}
                        compact
                        onClick={() => onEventClick(event.proposalId)}
                      />
                    </Box>
                  ))
                )}
              </Box>
            </Box>
          );
        })}
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: {
          xs: "1fr",
          sm: "repeat(2, 1fr)",
          md: `repeat(${Math.min(dayCount, 7)}, 1fr)`,
        },
        gap: 1,
      }}
    >
      {days.map((day) => {
        const key = localDateKey(day.toISOString());
        const dayEvents = eventsByDay.get(key) ?? [];
        const isToday = localDateKey(new Date().toISOString()) === key;
        return (
          <Box
            key={key}
            sx={{
              minHeight: 120,
              border: 1,
              borderColor: isToday ? "primary.main" : "divider",
              borderRadius: 1,
              p: 1,
              bgcolor: isToday ? "action.hover" : "background.paper",
            }}
          >
            <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
              {formatDayHeader(day)}
            </Typography>
            {dayEvents.length === 0 ? (
              <Typography variant="caption" color="text.disabled">
                No events
              </Typography>
            ) : (
              dayEvents.map((event) => (
                <ScheduleEventBlock
                  key={event.id}
                  event={event}
                  onClick={() => onEventClick(event.proposalId)}
                />
              ))
            )}
          </Box>
        );
      })}
    </Box>
  );
}
