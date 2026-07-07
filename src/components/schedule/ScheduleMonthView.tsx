"use client";

import { Box, Typography, useMediaQuery, useTheme } from "@mui/material";
import { useMemo } from "react";

import type { ScheduleEvent } from "@/actions/schedule";
import {
  LEVEL_COLORS,
  busynessLevelForDay,
} from "@/components/schedule/ScheduleHeatmap";
import {
  MonthEventIcon,
  MonthMoreLink,
  MonthSpanBar,
  StateDotStrip,
} from "@/components/schedule/MonthEventChip";
import { buildMonthLayout } from "@/lib/schedule/month-layout";
import {
  buildMonthGrid,
  startOfMonth,
} from "@/lib/schedule/month-grid";
import { localDateKey, scheduleDayCellSx, isTodayDate } from "@/lib/schedule/dates";

interface ScheduleMonthViewProps {
  monthAnchor: Date;
  events: ScheduleEvent[];
  timeZone?: string;
  onEventClick: (event: ScheduleEvent) => void;
  /** Switches to week view anchored on the clicked day (PC-56). */
  onDayClick?: (day: Date) => void;
}

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DATE_HEADER_HEIGHT = 22;
const LANE_HEIGHT = 18;
const ICON_ROW_HEIGHT = 22;
const CELL_PADDING = 16;

/**
 * Outlook-style month calendar with week-split span lanes and per-day icons (PC-55 / PC-77).
 */
export function ScheduleMonthView({
  monthAnchor,
  events,
  timeZone = "UTC",
  onEventClick,
  onDayClick,
}: ScheduleMonthViewProps) {
  const theme = useTheme();
  const isSmall = useMediaQuery(theme.breakpoints.down("sm"));
  const maxSpanLanes = isSmall ? 2 : 3;

  const grid = useMemo(() => buildMonthGrid(monthAnchor), [monthAnchor]);
  const monthStart = startOfMonth(monthAnchor);
  const monthKey = `${monthStart.getFullYear()}-${monthStart.getMonth()}`;

  const layout = useMemo(
    () => buildMonthLayout(grid, events, timeZone, maxSpanLanes),
    [grid, events, timeZone, maxSpanLanes],
  );

  const spanAreaHeight = maxSpanLanes * LANE_HEIGHT;
  const cellHeight =
    DATE_HEADER_HEIGHT + spanAreaHeight + ICON_ROW_HEIGHT + CELL_PADDING;

  return (
    <Box sx={{ mt: 1 }}>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: 0.5,
          mb: 0.5,
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

      {layout.weeks.map((week) => (
        <Box key={`week-${monthKey}-${week.weekIndex}`} sx={{ position: "relative", mb: 0.5 }}>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              gap: 0.5,
              minHeight: cellHeight,
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

              return (
                <Box
                  key={key}
                  component={onDayClick ? "button" : "div"}
                  type={onDayClick ? "button" : undefined}
                  onClick={onDayClick ? () => onDayClick(day) : undefined}
                  sx={{
                    border: 1,
                    borderColor: daySx.borderColor,
                    borderRadius: 1,
                    p: 0.5,
                    bgcolor: inMonth ? daySx.bgcolor : "action.hover",
                    opacity: inMonth ? daySx.opacity : 0.45,
                    height: cellHeight,
                    minHeight: cellHeight,
                    maxHeight: cellHeight,
                    position: "relative",
                    textAlign: "left",
                    cursor: onDayClick ? "pointer" : "default",
                    width: "100%",
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden",
                  }}
                >
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      minHeight: DATE_HEADER_HEIGHT - 4,
                      flexShrink: 0,
                    }}
                  >
                    <Typography
                      variant="caption"
                      fontWeight={isToday ? 800 : 600}
                      color={isToday ? "primary.main" : "text.primary"}
                    >
                      {day.getDate()}
                    </Typography>
                    <StateDotStrip variants={dayLayout.stateDots} />
                  </Box>

                  <Box sx={{ flex: 1, minHeight: spanAreaHeight, flexShrink: 0 }} aria-hidden />

                  <Box
                    sx={{
                      display: "flex",
                      flexWrap: "wrap",
                      alignContent: "flex-start",
                      gap: 0.25,
                      height: ICON_ROW_HEIGHT,
                      minHeight: ICON_ROW_HEIGHT,
                      maxHeight: ICON_ROW_HEIGHT,
                      overflow: "hidden",
                      flexShrink: 0,
                    }}
                  >
                    {dayLayout.chips.map((chip) => (
                      <MonthEventIcon
                        key={chip.key}
                        event={chip.event}
                        variant={chip.variant}
                        onClick={() => onEventClick(chip.event)}
                      />
                    ))}
                    <MonthMoreLink
                      count={dayLayout.hiddenCount}
                      onClick={() => onDayClick?.(day)}
                    />
                  </Box>

                  <Box
                    sx={{
                      position: "absolute",
                      bottom: 4,
                      left: 4,
                      width: 10,
                      height: 10,
                      borderRadius: 0.5,
                      bgcolor: LEVEL_COLORS[busynessLevel],
                      border: "1px solid",
                      borderColor: "divider",
                    }}
                    aria-label={`Network busyness: ${busynessLabel}`}
                  />
                </Box>
              );
            })}
          </Box>

          <Box
            sx={{
              position: "absolute",
              left: 0,
              right: 0,
              top: DATE_HEADER_HEIGHT,
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              gridTemplateRows: `repeat(${maxSpanLanes}, ${LANE_HEIGHT}px)`,
              gap: 0.5,
              pointerEvents: "none",
              px: 0,
            }}
          >
            {week.spanSegments.map((segment) => (
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
                  title={segment.event.isContentMasked ? "Busy" : segment.event.title}
                  variant={segment.variant}
                  showTitle={segment.showTitle}
                  isStartSegment={segment.isStartSegment}
                  isEndSegment={segment.isEndSegment}
                  isArchived={segment.event.state === "archived"}
                  onClick={() => onEventClick(segment.event)}
                />
              </Box>
            ))}
          </Box>
        </Box>
      ))}
    </Box>
  );
}
