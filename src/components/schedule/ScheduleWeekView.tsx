"use client";

import { Box, Typography } from "@mui/material";
import { useMemo } from "react";

import type { ScheduleEvent } from "@/actions/schedule";
import { ScheduleEventBlock } from "@/components/schedule/ScheduleEventBlock";
import {
  addDays,
  formatDayHeader,
  isTodayDate,
  localDateKey,
  scheduleDayCellSx,
  startOfWeekMonday,
} from "@/lib/schedule/dates";

interface ScheduleWeekViewProps {
  weekStart: Date;
  dayCount: number;
  events: ScheduleEvent[];
  compact: boolean;
  timeZone?: string;
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
  timeZone = "UTC",
  onEventClick,
}: ScheduleWeekViewProps) {
  const days = useMemo(() => {
    const monday = startOfWeekMonday(weekStart);
    return Array.from({ length: dayCount }, (_, index) => addDays(monday, index));
  }, [weekStart, dayCount]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, ScheduleEvent[]>();
    for (const day of days) {
      map.set(localDateKey(day.toISOString(), timeZone), []);
    }
    for (const event of events) {
      const key = localDateKey(event.startAt, timeZone);
      const list = map.get(key);
      if (list) list.push(event);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.startAt.localeCompare(b.startAt));
    }
    return map;
  }, [days, events, timeZone]);

  if (compact) {
    return (
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {days.map((day) => {
          const key = localDateKey(day.toISOString(), timeZone);
          const dayEvents = eventsByDay.get(key) ?? [];
          const daySx = scheduleDayCellSx(day, timeZone);
          const isToday = isTodayDate(day, timeZone);
          return (
            <Box
              key={key}
              sx={{
                display: "flex",
                alignItems: "flex-start",
                gap: 1,
                py: 0.5,
                borderBottom: 1,
                borderColor: isToday ? "primary.main" : "divider",
                width: "100%",
                minWidth: 0,
                opacity: daySx.opacity,
                bgcolor: daySx.bgcolor,
                borderRadius: 0.5,
                px: 0.5,
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  flexShrink: 0,
                  minWidth: 72,
                  fontWeight: isToday ? 700 : 600,
                  color: isToday ? "primary.main" : "text.secondary",
                }}
              >
                {formatDayHeader(day, timeZone)}
              </Typography>
              <Box
                sx={{
                  flex: 1,
                  minWidth: 0,
                  display: "flex",
                  gap: 0.5,
                  overflow: "hidden",
                }}
              >
                {dayEvents.length === 0 ? (
                  <Typography variant="caption" color="text.disabled">
                    —
                  </Typography>
                ) : (
                  dayEvents.map((event) => (
                    <Box key={event.id} sx={{ flex: 1, minWidth: 0 }}>
                      <ScheduleEventBlock
                        event={event}
                        compact
                        timeZone={timeZone}
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
        const key = localDateKey(day.toISOString(), timeZone);
        const dayEvents = eventsByDay.get(key) ?? [];
        const daySx = scheduleDayCellSx(day, timeZone);
        const isToday = isTodayDate(day, timeZone);
        return (
          <Box
            key={key}
            sx={{
              minHeight: 120,
              minWidth: 0,
              border: 1,
              borderColor: daySx.borderColor,
              borderRadius: 1,
              p: 1,
              bgcolor: daySx.bgcolor,
              opacity: daySx.opacity,
              overflow: "hidden",
            }}
          >
            <Typography
              variant="subtitle2"
              fontWeight={isToday ? 800 : 700}
              color={isToday ? "primary.main" : "text.primary"}
              sx={{ mb: 1 }}
            >
              {formatDayHeader(day, timeZone)}
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
                  timeZone={timeZone}
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
