"use client";

import { Box, Typography } from "@mui/material";
import { useMemo } from "react";

import type { ScheduleEvent } from "@/actions/schedule";
import { EmptyState } from "@/components/ui/EmptyState";
import { ScheduleEventBlock } from "@/components/schedule/ScheduleEventBlock";
import { isSleepingLikeType } from "@/lib/proposals/sleeping-like";
import {
  formatDayHeader,
  localDateKey,
  scheduleDayCellSx,
} from "@/lib/schedule/dates";
import { DEFAULT_VIEWER_TIMEZONE } from "@/lib/schedule/timezone";
import { fontFamilies } from "@/theme/fonts";
import { GARDEN_TOKENS, ORGANIC_RADIUS } from "@/theme/tokens";

const HOUR_HEIGHT_PX = 48;
const DAY_MINUTES = 24 * 60;

interface ScheduleDayViewProps {
  day: Date;
  events: ScheduleEvent[];
  timeZone?: string;
  onEventClick: (event: ScheduleEvent) => void;
}

/**
 * All-day strip includes true all-day events and sleeping arrangements
 * (non-time day events — PC-372). Timed events stay on the hour grid.
 */
function isAllDayLaneEvent(event: ScheduleEvent): boolean {
  return event.isAllDay || isSleepingLikeType(event.proposalType);
}

/** Minutes from local midnight for an instant in the viewer timezone. */
function minutesInTimeZone(iso: string, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

/**
 * Builds a Date at `hour`:00 in `timeZone` on the same civil day as `dayIso`,
 * so hour-grid labels stay aligned with event placement (PC-376).
 */
function zonedHourOnDay(dayIso: string, hour: number, timeZone: string): Date {
  const dayKey = localDateKey(dayIso, timeZone);
  const [year, month, dayNum] = dayKey.split("-").map(Number);
  // Noon UTC probe avoids DST edge ambiguity when reading the zone offset.
  const probe = new Date(Date.UTC(year!, month! - 1, dayNum!, 12, 0, 0));
  const offsetParts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
    hour: "numeric",
  }).formatToParts(probe);
  const tzName = offsetParts.find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const match = /GMT([+-])(\d+)(?::(\d+))?/.exec(tzName);
  let offsetMinutes = 0;
  if (match) {
    const sign = match[1] === "-" ? -1 : 1;
    offsetMinutes = sign * (Number(match[2]) * 60 + Number(match[3] ?? 0));
  }
  // Local wall time = UTC + offset → UTC = wall - offset.
  return new Date(Date.UTC(year!, month! - 1, dayNum!, hour, 0, 0) - offsetMinutes * 60_000);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Single-day 12a–12a hour grid with an all-day strip (PC-204 / PC-372).
 */
export function ScheduleDayView({
  day,
  events,
  timeZone = DEFAULT_VIEWER_TIMEZONE,
  onEventClick,
}: ScheduleDayViewProps) {
  const dayKey = localDateKey(day.toISOString(), timeZone);
  const cellSx = scheduleDayCellSx(day, timeZone);

  const { allDayEvents, timedEvents } = useMemo(() => {
    const allDay: ScheduleEvent[] = [];
    const timed: ScheduleEvent[] = [];
    for (const event of events) {
      const startKey = localDateKey(event.startAt, timeZone);
      const endKey = localDateKey(event.endAt ?? event.startAt, timeZone);
      if (startKey > dayKey || endKey < dayKey) continue;
      if (isAllDayLaneEvent(event)) {
        allDay.push(event);
      } else {
        timed.push(event);
      }
    }
    // Sleeping last within the all-day strip (PC-364 ordering preserved).
    allDay.sort((a, b) => {
      const aSleep = isSleepingLikeType(a.proposalType);
      const bSleep = isSleepingLikeType(b.proposalType);
      if (aSleep !== bSleep) return aSleep ? 1 : -1;
      return a.startAt.localeCompare(b.startAt);
    });
    timed.sort((a, b) => a.startAt.localeCompare(b.startAt));
    return { allDayEvents: allDay, timedEvents: timed };
  }, [dayKey, events, timeZone]);

  const hourLabels = useMemo(
    () =>
      Array.from({ length: 24 }, (_, hour) => {
        const labelDate = zonedHourOnDay(day.toISOString(), hour, timeZone);
        return labelDate.toLocaleTimeString(undefined, {
          hour: "numeric",
          timeZone,
        });
      }),
    [day, timeZone],
  );

  return (
    <Box
      data-testid="schedule-day-view"
      sx={{
        border: `2px solid ${GARDEN_TOKENS.ink}`,
        borderRadius: ORGANIC_RADIUS,
        bgcolor: cellSx.bgcolor,
        opacity: cellSx.opacity,
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          px: 1.5,
          py: 1,
          borderBottom: `2px solid ${GARDEN_TOKENS.ink}`,
          bgcolor: GARDEN_TOKENS.surface,
        }}
      >
        <Typography
          sx={{
            fontFamily: fontFamilies.label,
            fontWeight: 700,
            fontSize: "0.95rem",
            color: GARDEN_TOKENS.ink,
          }}
        >
          {formatDayHeader(day, timeZone)}
        </Typography>
      </Box>

      <Box
        sx={{
          px: 1,
          py: 1,
          borderBottom: `1px solid ${GARDEN_TOKENS.outlineSoft}`,
          minHeight: 48,
        }}
        data-testid="schedule-day-all-day-strip"
      >
        <Typography
          variant="caption"
          sx={{
            fontFamily: fontFamilies.label,
            fontWeight: 700,
            color: GARDEN_TOKENS.inkMuted,
            display: "block",
            mb: 0.5,
          }}
        >
          All day
        </Typography>
        {allDayEvents.length === 0 ? (
          <Typography variant="caption" color="text.secondary">
            No all-day events
          </Typography>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
            {allDayEvents.map((event, index) => (
              <ScheduleEventBlock
                key={`${event.proposalId}-${event.startAt}-allday`}
                event={event}
                compact
                timeZone={timeZone}
                rotationIndex={index}
                onClick={() => onEventClick(event)}
              />
            ))}
          </Box>
        )}
      </Box>

      <Box sx={{ display: "flex", maxHeight: HOUR_HEIGHT_PX * 14, overflowY: "auto" }}>
        <Box
          sx={{
            width: 52,
            flexShrink: 0,
            borderRight: `1px solid ${GARDEN_TOKENS.outlineSoft}`,
            bgcolor: GARDEN_TOKENS.surface,
          }}
        >
          {hourLabels.map((label, hour) => (
            <Box
              key={hour}
              sx={{
                height: HOUR_HEIGHT_PX,
                px: 0.5,
                pt: 0.25,
                borderBottom: `1px solid ${GARDEN_TOKENS.outlineSoft}`,
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  fontFamily: fontFamilies.label,
                  fontSize: "0.65rem",
                  color: GARDEN_TOKENS.inkMuted,
                  fontWeight: 600,
                }}
              >
                {label}
              </Typography>
            </Box>
          ))}
        </Box>

        <Box sx={{ position: "relative", flex: 1, height: HOUR_HEIGHT_PX * 24 }}>
          {hourLabels.map((_, hour) => (
            <Box
              key={hour}
              aria-hidden
              sx={{
                position: "absolute",
                left: 0,
                right: 0,
                top: hour * HOUR_HEIGHT_PX,
                height: HOUR_HEIGHT_PX,
                borderBottom: `1px solid ${GARDEN_TOKENS.outlineSoft}`,
              }}
            />
          ))}

          {timedEvents.length === 0 && allDayEvents.length === 0 ? (
            <Box sx={{ position: "absolute", inset: 0, p: 2 }}>
              <EmptyState title="Nothing scheduled" description="Tap + to add an event or sleeping night." />
            </Box>
          ) : null}

          {timedEvents.map((event, index) => {
            const startKey = localDateKey(event.startAt, timeZone);
            const endIso = event.endAt ?? event.startAt;
            const endKey = localDateKey(endIso, timeZone);
            let startMin =
              startKey === dayKey ? minutesInTimeZone(event.startAt, timeZone) : 0;
            let endMin =
              endKey === dayKey
                ? minutesInTimeZone(endIso, timeZone)
                : DAY_MINUTES;
            if (endMin <= startMin) endMin = Math.min(DAY_MINUTES, startMin + 60);
            startMin = clamp(startMin, 0, DAY_MINUTES - 15);
            endMin = clamp(endMin, startMin + 15, DAY_MINUTES);
            const top = (startMin / DAY_MINUTES) * (HOUR_HEIGHT_PX * 24);
            const height = ((endMin - startMin) / DAY_MINUTES) * (HOUR_HEIGHT_PX * 24);

            return (
              <Box
                key={`${event.proposalId}-${event.startAt}-timed`}
                sx={{
                  position: "absolute",
                  left: 4,
                  right: 4,
                  top,
                  height: Math.max(height, 28),
                  zIndex: 1,
                }}
              >
                <ScheduleEventBlock
                  event={event}
                  compact
                  timeZone={timeZone}
                  rotationIndex={index}
                  onClick={() => onEventClick(event)}
                />
              </Box>
            );
          })}
        </Box>
      </Box>
    </Box>
  );
}
