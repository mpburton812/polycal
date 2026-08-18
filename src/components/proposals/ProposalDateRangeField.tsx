"use client";

import { DateCalendar } from "@mui/x-date-pickers/DateCalendar";
import { PickersDay, type PickersDayProps } from "@mui/x-date-pickers/PickersDay";
import dayjs, { type Dayjs } from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { Box, Stack, TextField, Typography } from "@mui/material";
import { useMemo, useRef, useState } from "react";

import { GARDEN_TOKENS } from "@/theme/tokens";

import { POLY_GREEN } from "./proposalCardTheme";
import { orderDateRangeInputs } from "./proposalDateRangeUtils";

dayjs.extend(customParseFormat);

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
 * Calendar: tap once for a single day; tap-and-drag (or a second click) for a range (PC-434).
 * ISO text fields stay in sync for accessibility and E2E fills.
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
  const dragRef = useRef<{ origin: string } | null>(null);
  const skipClickRef = useRef(false);

  const rangeStart = useMemo(() => {
    if (start && end) return start.isBefore(end) ? start : end;
    return start ?? end;
  }, [start, end]);
  const rangeEnd = useMemo(() => {
    if (start && end) return start.isAfter(end) ? start : end;
    return start && end ? end : null;
  }, [start, end]);

  function applyOrderedRange(a: string, b: string) {
    const next = orderDateRangeInputs(a, b);
    // Keep incomplete End day text ("" / "2") instead of coalescing to start (PC-209).
    onRangeChange(next.start, next.end);
  }

  function handleDaySelect(day: Dayjs | null) {
    if (!day || !day.isValid() || disabled) return;
    if (skipClickRef.current) {
      skipClickRef.current = false;
      return;
    }
    const iso = day.format("YYYY-MM-DD");
    if (!anchor) {
      setAnchor(day);
      onRangeChange(iso, iso);
      return;
    }
    applyOrderedRange(anchor.format("YYYY-MM-DD"), iso);
    setAnchor(null);
  }

  function DayButton(props: PickersDayProps<Dayjs>) {
    const { day, outsideCurrentMonth, ...other } = props;
    const iso = day.format("YYYY-MM-DD");
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
        onPointerDown={(event) => {
          if (disabled || outsideCurrentMonth) return;
          skipClickRef.current = true;
          dragRef.current = { origin: iso };
          onRangeChange(iso, iso);
          setAnchor(day);
          (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
        }}
        onPointerEnter={() => {
          if (!dragRef.current || disabled) return;
          applyOrderedRange(dragRef.current.origin, iso);
        }}
        onPointerUp={() => {
          dragRef.current = null;
        }}
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
        ? `${start.format("MMM D, YYYY")} (all day — drag or tap another day for a range)`
        : "Tap a day, or drag across days";

  return (
    <Stack spacing={1}>
      <Typography variant="body2" sx={{ fontWeight: 600, color: GARDEN_TOKENS.ink }}>
        {startLabel}
        {endLabel ? ` / ${endLabel}` : ""}
      </Typography>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
        <TextField
          label={startLabel}
          size="small"
          fullWidth
          disabled={disabled}
          value={startValue}
          onChange={(event) => {
            setAnchor(null);
            applyOrderedRange(event.target.value.trim(), endValue || event.target.value.trim());
          }}
          placeholder="YYYY-MM-DD"
          helperText="ISO date"
          inputProps={{ "data-testid": "date-range-start", "aria-label": startLabel }}
        />
        <TextField
          label={endLabel || "End"}
          size="small"
          fullWidth
          disabled={disabled}
          value={endValue}
          onChange={(event) => {
            setAnchor(null);
            applyOrderedRange(startValue, event.target.value.trim());
          }}
          placeholder="YYYY-MM-DD"
          helperText="Optional end"
          inputProps={{ "data-testid": "date-range-end", "aria-label": endLabel || "End" }}
        />
      </Stack>
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
