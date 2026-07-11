"use client";

import { DateCalendar } from "@mui/x-date-pickers/DateCalendar";
import { PickersDay, type PickersDayProps } from "@mui/x-date-pickers/PickersDay";
import dayjs, { type Dayjs } from "dayjs";
import { Box, Stack, Typography } from "@mui/material";
import { useMemo, useState } from "react";

import { GARDEN_TOKENS } from "@/theme/tokens";

import { POLY_GREEN } from "./proposalCardTheme";

interface ProposalDateRangeFieldProps {
  startLabel: string;
  endLabel: string;
  startValue: string;
  endValue: string;
  onRangeChange: (start: string, end: string) => void;
  disabled?: boolean;
  helperText?: string;
}

function parseDate(value: string): Dayjs | null {
  if (!value) return null;
  const parsed = dayjs(value, "YYYY-MM-DD", true);
  return parsed.isValid() ? parsed : null;
}

/**
 * Single calendar that accepts two day clicks for a start/end range (PC-153).
 * Earliest click becomes start; latest becomes end. A third click starts a new range.
 */
export function ProposalDateRangeField({
  startLabel,
  endLabel,
  startValue,
  endValue,
  onRangeChange,
  disabled,
  helperText,
}: ProposalDateRangeFieldProps) {
  const start = parseDate(startValue);
  const end = parseDate(endValue);
  const [anchor, setAnchor] = useState<Dayjs | null>(null);

  const rangeStart = useMemo(() => {
    if (start && end) return start.isBefore(end) ? start : end;
    return start ?? end;
  }, [start, end]);
  const rangeEnd = useMemo(() => {
    if (start && end) return start.isAfter(end) ? start : end;
    return null;
  }, [start, end]);

  function handleDaySelect(day: Dayjs | null) {
    if (!day || !day.isValid() || disabled) return;
    const iso = day.format("YYYY-MM-DD");

    if (!anchor) {
      // First click — set provisional start; clear end until second click.
      setAnchor(day);
      onRangeChange(iso, "");
      return;
    }

    const a = anchor.format("YYYY-MM-DD");
    const [earliest, latest] = a <= iso ? [a, iso] : [iso, a];
    setAnchor(null);
    onRangeChange(earliest, latest === earliest ? "" : latest);
  }

  function DayButton(props: PickersDayProps<Dayjs>) {
    const { day, outsideCurrentMonth, ...other } = props;
    const inRange =
      !outsideCurrentMonth &&
      rangeStart &&
      rangeEnd &&
      !day.isBefore(rangeStart, "day") &&
      !day.isAfter(rangeEnd, "day");
    const isEdge =
      !outsideCurrentMonth &&
      ((rangeStart && day.isSame(rangeStart, "day")) ||
        (rangeEnd && day.isSame(rangeEnd, "day")) ||
        (anchor && day.isSame(anchor, "day")));

    return (
      <PickersDay
        {...other}
        day={day}
        outsideCurrentMonth={outsideCurrentMonth}
        selected={Boolean(isEdge)}
        sx={{
          ...(inRange
            ? {
                bgcolor: "rgba(107, 143, 113, 0.22)",
                borderRadius: 0,
              }
            : null),
          ...(isEdge
            ? {
                bgcolor: `${POLY_GREEN} !important`,
                color: "#fff !important",
                borderRadius: "50%",
              }
            : null),
        }}
      />
    );
  }

  const summary =
    start && end && !start.isSame(end, "day")
      ? `${start.format("MMM D, YYYY")} → ${end.format("MMM D, YYYY")}`
      : start
        ? `${start.format("MMM D, YYYY")} (click a second day for end)`
        : "Click a start day, then an end day";

  return (
    <Stack spacing={1}>
      <Typography variant="body2" sx={{ fontWeight: 600, color: GARDEN_TOKENS.ink }}>
        {startLabel}
        {endLabel ? ` / ${endLabel}` : ""}
      </Typography>
      <Box
        sx={{
          border: `1px solid ${GARDEN_TOKENS.ink}`,
          borderRadius: 2,
          overflow: "hidden",
          opacity: disabled ? 0.5 : 1,
          pointerEvents: disabled ? "none" : "auto",
        }}
      >
        <DateCalendar
          value={anchor ?? start}
          onChange={handleDaySelect}
          slots={{ day: DayButton }}
        />
      </Box>
      <Typography variant="caption" color="text.secondary">
        {summary}
        {helperText ? ` — ${helperText}` : ""}
      </Typography>
    </Stack>
  );
}
