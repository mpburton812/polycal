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

interface ScheduleWeekViewProps {
  weekStart: Date;
  dayCount: number;
  events: ScheduleEvent[];
  compact: boolean;
  timeZone?: string;
  onEventClick: (event: ScheduleEvent) => void;
  /** Opens day sheet when compact overflow exceeds the visible chip cap (PC-165). */
  onDayOverflowClick?: (day: Date) => void;
}

const COMPACT_VISIBLE = 3;

/**
 * Renders a multi-day column grid with events grouped by local day (PC-42).
 */
export function ScheduleWeekView({
  weekStart,
  dayCount,
  events,
  compact,
  timeZone = DEFAULT_VIEWER_TIMEZONE,
  onEventClick,
  onDayOverflowClick,
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

    const dayKeys = Array.from(map.keys());

    for (const event of events) {
      const startKey = localDateKey(event.startAt, timeZone);
      const endKey = localDateKey(event.endAt ?? event.startAt, timeZone);
      const keysToPlace = dayKeys.filter((key) => key >= startKey && key <= endKey);
      const targets = keysToPlace.length > 0 ? keysToPlace : [startKey];

      for (const key of targets) {
        const list = map.get(key);
        if (list) list.push(event);
      }
    }

    for (const [key, list] of map.entries()) {
      map.set(key, sortDayEvents(list));
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
                  alignItems: "center",
                }}
              >
                {dayEvents.length === 0 ? (
                  <Typography variant="caption" sx={{ color: GARDEN_TOKENS.inkMuted }}>
                    Quiet day
                  </Typography>
                ) : (
                  <>
                    {dayEvents.slice(0, COMPACT_VISIBLE).map((event, index) => (
                      <Box key={event.id} sx={{ flex: 1, minWidth: 0 }}>
                        <ScheduleEventBlock
                          event={event}
                          compact
                          timeZone={timeZone}
                          rotationIndex={index}
                          onClick={() => onEventClick(event)}
                        />
                      </Box>
                    ))}
                    {dayEvents.length > COMPACT_VISIBLE && onDayOverflowClick && (
                      <Typography
                        component="button"
                        type="button"
                        variant="caption"
                        aria-label={`Show ${dayEvents.length - COMPACT_VISIBLE} more events`}
                        onClick={() => onDayOverflowClick(day)}
                        sx={{
                          flexShrink: 0,
                          border: "none",
                          background: "none",
                          color: GARDEN_TOKENS.sage,
                          fontWeight: 700,
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                        }}
                      >
                        +{dayEvents.length - COMPACT_VISIBLE}
                      </Typography>
                    )}
                  </>
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
      {days.map((day, dayIndex) => {
        const key = localDateKey(day.toISOString(), timeZone);
        const dayEvents = eventsByDay.get(key) ?? [];
        const daySx = scheduleDayCellSx(day, timeZone);
        const isToday = isTodayDate(day, timeZone);
        const stagger = dayIndex % 2 === 1 ? { mt: 0.75 } : undefined;
        return (
          <Box
            key={key}
            sx={{
              minHeight: 120,
              minWidth: 0,
              border: `2px solid ${GARDEN_TOKENS.ink}`,
              borderRadius: ORGANIC_RADIUS,
              p: 1,
              bgcolor: daySx.bgcolor ?? GARDEN_TOKENS.surface,
              opacity: daySx.opacity,
              overflow: "hidden",
              boxShadow: "none",
              ...stagger,
            }}
          >
            <Typography
              variant="subtitle2"
              fontWeight={isToday ? 800 : 700}
              sx={{
                mb: 1,
                fontFamily: fontFamilies.label,
                color: isToday ? GARDEN_TOKENS.sage : GARDEN_TOKENS.ink,
              }}
            >
              {formatDayHeader(day, timeZone)}
            </Typography>
            {dayEvents.length === 0 ? (
              <EmptyState
                illustration="schedule-day"
                title="Nothing on the calendar"
                description="Enjoy the quiet."
                compact
                data-testid="schedule-day-empty"
              />
            ) : (
              dayEvents.map((event, index) => (
                <ScheduleEventBlock
                  key={event.id}
                  event={event}
                  timeZone={timeZone}
                  rotationIndex={index}
                  onClick={() => onEventClick(event)}
                />
              ))
            )}
          </Box>
        );
      })}
    </Box>
  );
}
