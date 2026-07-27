"use client";

import { Box, Typography } from "@mui/material";
import { useMemo } from "react";

import type { ScheduleEvent } from "@/actions/schedule";
import { EmptyState } from "@/components/ui/EmptyState";
import { ScheduleEventBlock } from "@/components/schedule/ScheduleEventBlock";
import {
  addDays,
  formatDayHeader,
  isTodayDate,
  localDateKey,
  scheduleDayCellSx,
  startOfWeekMonday,
} from "@/lib/schedule/dates";
import { sortDayEvents } from "@/lib/schedule/sort-day-events";
import { DEFAULT_VIEWER_TIMEZONE } from "@/lib/schedule/timezone";
import { fontFamilies } from "@/theme/fonts";
import { GARDEN_TOKENS, ORGANIC_RADIUS } from "@/theme/tokens";

interface ScheduleAgendaViewProps {
  weekStart: Date;
  dayCount: number;
  events: ScheduleEvent[];
  timeZone?: string;
  onEventClick: (event: ScheduleEvent) => void;
  onDayHeaderClick?: (day: Date) => void;
  compactOverflowLimit?: number;
  onDayOverflowClick?: (day: Date) => void;
}

/**
 * Mobile-friendly agenda list grouped by day (PC-166).
 */
export function ScheduleAgendaView({
  weekStart,
  dayCount,
  events,
  timeZone = DEFAULT_VIEWER_TIMEZONE,
  onEventClick,
  onDayHeaderClick,
  compactOverflowLimit = 4,
  onDayOverflowClick,
}: ScheduleAgendaViewProps) {
  const days = useMemo(() => {
    const monday = startOfWeekMonday(weekStart);
    return Array.from({ length: dayCount }, (_, index) => addDays(monday, index));
  }, [weekStart, dayCount]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, ScheduleEvent[]>();
    for (const day of days) {
      map.set(localDateKey(day.toISOString(), timeZone), []);
    }
    const dayKeys = Array.from(map.keys());
    for (const event of events) {
      const startKey = localDateKey(event.startAt, timeZone);
      const endKey = localDateKey(event.endAt ?? event.startAt, timeZone);
      const keysToPlace = dayKeys.filter((key) => key >= startKey && key <= endKey);
      const targets = keysToPlace.length > 0 ? keysToPlace : [startKey];
      for (const key of targets) {
        map.get(key)?.push(event);
      }
    }
    for (const [key, list] of map.entries()) {
      map.set(key, sortDayEvents(list));
    }
    return map;
  }, [days, events, timeZone]);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      {days.map((day) => {
        const key = localDateKey(day.toISOString(), timeZone);
        const dayEvents = eventsByDay.get(key) ?? [];
        const daySx = scheduleDayCellSx(day, timeZone);
        const isToday = isTodayDate(day, timeZone);
        const overflow = Math.max(0, dayEvents.length - compactOverflowLimit);
        const visible = overflow > 0 ? dayEvents.slice(0, compactOverflowLimit) : dayEvents;

        return (
          <Box
            key={key}
            sx={{
              border: `2px solid ${GARDEN_TOKENS.ink}`,
              borderRadius: ORGANIC_RADIUS,
              bgcolor: daySx.bgcolor,
              opacity: daySx.opacity,
              p: 1.25,
              borderColor: isToday ? GARDEN_TOKENS.sage : GARDEN_TOKENS.ink,
            }}
          >
            <Typography
              component={onDayHeaderClick ? "button" : "h3"}
              type={onDayHeaderClick ? "button" : undefined}
              onClick={onDayHeaderClick ? () => onDayHeaderClick(day) : undefined}
              variant="subtitle2"
              sx={{
                fontFamily: fontFamilies.label,
                fontWeight: 700,
                mb: 1,
                border: "none",
                background: "none",
                p: 0,
                cursor: onDayHeaderClick ? "pointer" : "default",
                color: GARDEN_TOKENS.ink,
                textAlign: "left",
                width: "100%",
              }}
            >
              {formatDayHeader(day, timeZone)}
              {isToday ? " · Today" : ""}
            </Typography>

            {dayEvents.length === 0 ? (
              <EmptyState
                illustration="schedule-day"
                title="Nothing on the calendar"
                description="Enjoy the quiet."
                compact
              />
            ) : (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
                {visible.map((event, index) => (
                  <ScheduleEventBlock
                    key={`${event.proposalId}-${event.sliceKey}-${index}`}
                    event={event}
                    rotationIndex={index}
                    timeZone={timeZone}
                    onClick={() => onEventClick(event)}
                  />
                ))}
                {overflow > 0 && onDayOverflowClick && (
                  <Typography
                    component="button"
                    type="button"
                    variant="caption"
                    onClick={() => onDayOverflowClick(day)}
                    sx={{
                      border: "none",
                      background: "none",
                      color: GARDEN_TOKENS.sage,
                      cursor: "pointer",
                      textAlign: "left",
                      p: 0,
                      fontWeight: 600,
                    }}
                  >
                    +{overflow} more
                  </Typography>
                )}
              </Box>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
