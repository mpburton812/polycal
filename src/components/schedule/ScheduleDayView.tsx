"use client";

import { Box, Typography } from "@mui/material";
import { useMemo } from "react";

import type { ScheduleEvent } from "@/actions/schedule";
import { EmptyState } from "@/components/ui/EmptyState";
import { ScheduleEventBlock } from "@/components/schedule/ScheduleEventBlock";
import {
  formatDayHeader,
  localDateKey,
  scheduleDayCellSx,
} from "@/lib/schedule/dates";
import { fontFamilies } from "@/theme/fonts";
import { GARDEN_TOKENS, ORGANIC_RADIUS } from "@/theme/tokens";

const HOUR_HEIGHT_PX = 48;
const DAY_MINUTES = 24 * 60;
/** Sleeping arrangements occupy the overnight 12a–8a band on the hour grid (PC-364). */
const SLEEPING_BAND_HOURS = 8;
const SLEEPING_BAND_PX = SLEEPING_BAND_HOURS * HOUR_HEIGHT_PX;

interface ScheduleDayViewProps {
  day: Date;
  events: ScheduleEvent[];
  timeZone?: string;
  onEventClick: (event: ScheduleEvent) => void;
}

/** True all-day events only — sleeping uses the timed 0–8am band (PC-364). */
function isAllDayLaneEvent(event: ScheduleEvent): boolean {
  return event.isAllDay && event.proposalType !== "sleeping";
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Single-day 12a–12a hour grid with an all-day strip (PC-204).
 */
export function ScheduleDayView({
  day,
  events,
  timeZone = "UTC",
  onEventClick,
}: ScheduleDayViewProps) {
  const dayKey = localDateKey(day.toISOString(), timeZone);
  const cellSx = scheduleDayCellSx(day, timeZone);

  const { allDayEvents, timedEvents, sleepingEvents } = useMemo(() => {
    const allDay: ScheduleEvent[] = [];
    const timed: ScheduleEvent[] = [];
    const sleeping: ScheduleEvent[] = [];
    for (const event of events) {
      const startKey = localDateKey(event.startAt, timeZone);
      const endKey = localDateKey(event.endAt ?? event.startAt, timeZone);
      if (startKey > dayKey || endKey < dayKey) continue;
      if (event.proposalType === "sleeping") {
        sleeping.push(event);
      } else if (isAllDayLaneEvent(event)) {
        allDay.push(event);
      } else {
        timed.push(event);
      }
    }
    allDay.sort((a, b) => a.startAt.localeCompare(b.startAt));
    timed.sort((a, b) => a.startAt.localeCompare(b.startAt));
    sleeping.sort((a, b) => a.startAt.localeCompare(b.startAt));
    return { allDayEvents: allDay, timedEvents: timed, sleepingEvents: sleeping };
  }, [dayKey, events, timeZone]);

  const hourLabels = useMemo(
    () =>
      Array.from({ length: 24 }, (_, hour) => {
        const labelDate = new Date(day);
        labelDate.setHours(hour, 0, 0, 0);
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

          {timedEvents.length === 0 &&
          allDayEvents.length === 0 &&
          sleepingEvents.length === 0 ? (
            <Box sx={{ position: "absolute", inset: 0, p: 2 }}>
              <EmptyState title="Nothing scheduled" description="Tap + to add an event or sleeping night." />
            </Box>
          ) : null}

          {sleepingEvents.map((event, index) => {
            const stackCount = sleepingEvents.length;
            const height = Math.max(SLEEPING_BAND_PX / stackCount, 28);
            const top = Math.min(index * height, SLEEPING_BAND_PX - height);
            return (
              <Box
                key={`${event.proposalId}-${event.startAt}-sleeping`}
                sx={{
                  position: "absolute",
                  left: 4,
                  right: 4,
                  top,
                  height: Math.min(height, SLEEPING_BAND_PX - top),
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
                  rotationIndex={index + sleepingEvents.length}
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
