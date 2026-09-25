"use client";

import { Box, Typography } from "@mui/material";
import { useEffect, useMemo, useRef, useState } from "react";

import type { ScheduleEvent } from "@/actions/schedule";
import {
  LEVEL_COLORS,
  busynessLevelForDay,
} from "@/components/schedule/ScheduleHeatmap";
import { MonthMoreLink, MonthSpanBar, MonthTimedLine } from "@/components/schedule/MonthEventChip";
import { MASKED_TITLE } from "@/lib/proposals/access";
import {
  buildMonthLayout,
  chooseVisibleBarLanes,
  packMonthDay,
} from "@/lib/schedule/month-layout";
import { buildMonthGrid, startOfMonth } from "@/lib/schedule/month-grid";
import { formatCompactStartTime, isTodayDate, localDateKey, scheduleDayCellSx } from "@/lib/schedule/dates";
import { DEFAULT_VIEWER_TIMEZONE } from "@/lib/schedule/timezone";
import { GARDEN_TOKENS, ORGANIC_RADIUS } from "@/theme/tokens";

interface ScheduleMonthViewProps {
  monthAnchor: Date;
  events: ScheduleEvent[];
  timeZone?: string;
  onEventClick: (event: ScheduleEvent) => void;
  /** Opens the day schedule when the date number is clicked (PC-494). */
  onDayClick?: (day: Date) => void;
  /** Opens the read-only overflow flyout. Only the N more control uses this (PC-524). */
  onMoreClick?: (day: Date) => void;
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DATE_HEADER_HEIGHT = 26;
const LINE_HEIGHT = 18;
const CELL_PADDING = 8;
const DEFAULT_MAX_LINES = 4;

/**
 * Month calendar: sleeping and all-day bars, then timed lines, with N more when the cell is full (PC-523).
 */
export function ScheduleMonthView({
  monthAnchor,
  events,
  timeZone = DEFAULT_VIEWER_TIMEZONE,
  onEventClick,
  onDayClick,
  onMoreClick,
}: ScheduleMonthViewProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [maxLines, setMaxLines] = useState(DEFAULT_MAX_LINES);

  const grid = useMemo(() => buildMonthGrid(monthAnchor, timeZone), [monthAnchor, timeZone]);
  const monthStart = startOfMonth(monthAnchor, timeZone);
  const monthKey = `${monthStart.getFullYear()}-${monthStart.getMonth()}`;

  const layout = useMemo(
    () => buildMonthLayout(grid, events, timeZone),
    [grid, events, timeZone],
  );

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const measure = () => {
      const weekCount = Math.max(1, layout.weeks.length);
      const header = root.querySelector("[data-month-weekdays]")?.clientHeight ?? 20;
      const rowHeight = Math.max(LINE_HEIGHT, (root.clientHeight - header) / weekCount);
      const lines = Math.max(
        1,
        Math.floor((rowHeight - DATE_HEADER_HEIGHT - CELL_PADDING) / LINE_HEIGHT),
      );
      setMaxLines(lines);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, [layout.weeks.length]);

  return (
    <Box ref={rootRef} sx={{ mt: 1, height: "100%", minHeight: 280, display: "flex", flexDirection: "column" }}>
      <Box
        data-month-weekdays
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: 0.5,
          mb: 0.5,
          flexShrink: 0,
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

      <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 0.5 }}>
        {layout.weeks.map((week) => {
          const visibleBarLanes = chooseVisibleBarLanes(
            week.laneCount,
            maxLines,
            week.days.map((day) => ({ bars: day.bars, timedCount: day.timed.length })),
          );

          return (
            <Box
              key={`week-${monthKey}-${week.weekIndex}`}
              sx={{ position: "relative", flex: 1, minHeight: 0 }}
            >
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "repeat(7, 1fr)",
                  gap: 0.5,
                  height: "100%",
                }}
              >
                {week.days.map((dayLayout) => {
                  const day = grid[dayLayout.dayIndex]!;
                  const key = localDateKey(day.toISOString(), timeZone);
                  const inMonth = day.getMonth() === monthStart.getMonth();
                  const busynessLevel = busynessLevelForDay(events, day);
                  const busynessLabel =
                    busynessLevel === 0 ? "open" : busynessLevel === 3 ? "very busy" : "busy";
                  const daySx = scheduleDayCellSx(day, timeZone);
                  const isToday = isTodayDate(day, timeZone);
                  const packed = packMonthDay({
                    bars: dayLayout.bars,
                    timedCount: dayLayout.timed.length,
                    maxLines,
                    visibleBarLanes,
                  });
                  const dateLabel = day.toLocaleDateString(undefined, {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                  });

                  return (
                    <Box
                      key={key}
                      id={isToday ? "schedule-month-today" : undefined}
                      sx={{
                        border: `2px solid ${inMonth ? GARDEN_TOKENS.ink : GARDEN_TOKENS.outlineSoft}`,
                        borderRadius: ORGANIC_RADIUS,
                        p: 0.5,
                        bgcolor: inMonth ? daySx.bgcolor : GARDEN_TOKENS.outlineSoft,
                        opacity: inMonth ? daySx.opacity : 0.45,
                        height: "100%",
                        minHeight: 0,
                        position: "relative",
                        textAlign: "left",
                        display: "flex",
                        flexDirection: "column",
                        overflow: "hidden",
                      }}
                    >
                      <Box
                        component={onDayClick ? "button" : "div"}
                        type={onDayClick ? "button" : undefined}
                        aria-label={
                          onDayClick
                            ? `${dateLabel}, ${busynessLabel}. Open day schedule`
                            : undefined
                        }
                        onClick={onDayClick ? () => onDayClick(day) : undefined}
                        sx={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: 22,
                          height: 22,
                          flexShrink: 0,
                          border: "none",
                          bgcolor: "transparent",
                          p: 0,
                          cursor: onDayClick ? "pointer" : "default",
                          position: "relative",
                          "&:focus-visible": {
                            outline: `2px solid ${GARDEN_TOKENS.sage}`,
                            outlineOffset: 1,
                          },
                        }}
                      >
                        <Box
                          component="span"
                          sx={{
                            position: "absolute",
                            inset: 0,
                            borderRadius: "50%",
                            bgcolor: LEVEL_COLORS[busynessLevel],
                            border: "1px solid",
                            borderColor: isToday ? GARDEN_TOKENS.sage : GARDEN_TOKENS.outlineSoft,
                          }}
                          aria-hidden
                        />
                        <Typography
                          variant="caption"
                          fontWeight={isToday ? 800 : 600}
                          color={isToday ? "primary.main" : "text.primary"}
                          sx={{ position: "relative", zIndex: 1, lineHeight: 1 }}
                        >
                          {day.getDate()}
                        </Typography>
                      </Box>

                      <Box sx={{ height: visibleBarLanes * LINE_HEIGHT, flexShrink: 0 }} aria-hidden />

                      {dayLayout.timed.slice(0, packed.visibleTimedCount).map((line) => (
                        <MonthTimedLine
                          key={line.key}
                          event={line.event}
                          variant={line.variant}
                          timeLabel={formatCompactStartTime(line.event.startAt, timeZone)}
                          onClick={() => onEventClick(line.event)}
                        />
                      ))}
                      <MonthMoreLink
                        count={packed.hiddenCount}
                        onClick={() => onMoreClick?.(day)}
                      />
                    </Box>
                  );
                })}
              </Box>

              {visibleBarLanes > 0 && (
                <Box
                  sx={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    top: DATE_HEADER_HEIGHT,
                    display: "grid",
                    gridTemplateColumns: "repeat(7, 1fr)",
                    gridTemplateRows: `repeat(${visibleBarLanes}, ${LINE_HEIGHT}px)`,
                    gap: 0.5,
                    pointerEvents: "none",
                    px: 0.5,
                  }}
                >
                  {week.spanSegments
                    .filter((segment) => segment.lane < visibleBarLanes)
                    .map((segment) => (
                      <Box
                        key={segment.key}
                        sx={{
                          gridColumn: `${segment.startCol} / ${segment.endCol}`,
                          gridRow: segment.lane + 1,
                          pointerEvents: "auto",
                          minWidth: 0,
                        }}
                      >
                        <MonthSpanBar
                          title={segment.event.isContentMasked ? MASKED_TITLE : segment.event.title}
                          variant={segment.variant}
                          showTitle={segment.showTitle}
                          isStartSegment={segment.isStartSegment}
                          isEndSegment={segment.isEndSegment}
                          isArchived={segment.event.state === "archived"}
                          isTentative={segment.event.isTentative}
                          onClick={() => onEventClick(segment.event)}
                        />
                      </Box>
                    ))}
                </Box>
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
