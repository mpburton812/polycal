"use client";

import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { DateTimePicker } from "@mui/x-date-pickers/DateTimePicker";
import { TimePicker } from "@mui/x-date-pickers/TimePicker";
import dayjs, { type Dayjs } from "dayjs";
import { Stack } from "@mui/material";

interface ScheduleFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  helperText?: string;
}

const textFieldSlotProps = {
  textField: {
    size: "small" as const,
    fullWidth: true,
    InputLabelProps: { shrink: true },
  },
};

/** Parses yyyy-MM-dd stored in sleeping draft slots. */
function parseDateValue(value: string): Dayjs | null {
  if (!value) return null;
  const parsed = dayjs(value, "YYYY-MM-DD", true);
  return parsed.isValid() ? parsed : null;
}

/** Parses yyyy-MM-ddTHH:mm from event draft slots (datetime-local compatible). */
function parseDateTimeValue(value: string): Dayjs | null {
  if (!value) return null;
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed : null;
}

/**
 * Modern calendar picker for sleeping proposal dates (no clock times).
 */
export function ProposalDateField({
  label,
  value,
  onChange,
  disabled,
  helperText,
}: ScheduleFieldProps) {
  return (
    <DatePicker
      label={label}
      value={parseDateValue(value)}
      onChange={(next) => onChange(next?.isValid() ? next.format("YYYY-MM-DD") : "")}
      disabled={disabled}
      slotProps={{
        ...textFieldSlotProps,
        textField: {
          ...textFieldSlotProps.textField,
          helperText,
        },
      }}
    />
  );
}

/**
 * Calendar + digital time for event proposal start/end (PC-125).
 * Uses MUI digital time views — no analog clock dial.
 */
export function ProposalDateTimeField({
  label,
  value,
  onChange,
  disabled,
  helperText,
}: ScheduleFieldProps) {
  return (
    <DateTimePicker
      label={label}
      value={parseDateTimeValue(value)}
      onChange={(next) => onChange(next?.isValid() ? next.format("YYYY-MM-DDTHH:mm") : "")}
      disabled={disabled}
      ampm
      // Explicit digital time entry — do not use renderTimeViewClock.
      views={["year", "month", "day", "hours", "minutes"]}
      slotProps={{
        ...textFieldSlotProps,
        textField: {
          ...textFieldSlotProps.textField,
          helperText,
        },
      }}
    />
  );
}

interface SplitDateTimeFieldProps extends ScheduleFieldProps {
  /** Optional caption under the time field (e.g. end defaults). */
  timeHelperText?: string;
}

/**
 * Separate date + digital time pickers for clearer event schedule entry (PC-125).
 */
export function ProposalSplitDateTimeField({
  label,
  value,
  onChange,
  disabled,
  helperText,
  timeHelperText,
}: SplitDateTimeFieldProps) {
  const parsed = parseDateTimeValue(value);
  const datePart = parsed?.format("YYYY-MM-DD") ?? "";
  const timePart = parsed;

  return (
    <Stack spacing={1}>
      <DatePicker
        label={`${label} date`}
        value={datePart ? dayjs(datePart, "YYYY-MM-DD", true) : null}
        onChange={(next) => {
          if (!next?.isValid()) {
            onChange("");
            return;
          }
          const hours = timePart?.hour() ?? 9;
          const minutes = timePart?.minute() ?? 0;
          onChange(next.hour(hours).minute(minutes).format("YYYY-MM-DDTHH:mm"));
        }}
        disabled={disabled}
        slotProps={{
          ...textFieldSlotProps,
          textField: {
            ...textFieldSlotProps.textField,
            helperText,
          },
        }}
      />
      <TimePicker
        label={`${label} time`}
        value={timePart}
        onChange={(next) => {
          if (!next?.isValid()) return;
          const base = datePart ? dayjs(datePart, "YYYY-MM-DD", true) : dayjs();
          if (!base.isValid()) return;
          onChange(base.hour(next.hour()).minute(next.minute()).format("YYYY-MM-DDTHH:mm"));
        }}
        disabled={disabled || !datePart}
        ampm
        slotProps={{
          ...textFieldSlotProps,
          textField: {
            ...textFieldSlotProps.textField,
            helperText: timeHelperText,
          },
        }}
      />
    </Stack>
  );
}

interface ProposalScheduleFieldProps extends ScheduleFieldProps {
  mode: "date" | "datetime";
  /** When true, use split date + digital time instead of combined DateTimePicker. */
  splitDateTime?: boolean;
  timeHelperText?: string;
}

/** Date-only or date-time picker based on proposal type (PC-125). */
export function ProposalScheduleField({
  mode,
  splitDateTime = false,
  timeHelperText,
  ...props
}: ProposalScheduleFieldProps) {
  if (mode === "date") {
    return <ProposalDateField {...props} />;
  }
  if (splitDateTime) {
    return <ProposalSplitDateTimeField {...props} timeHelperText={timeHelperText} />;
  }
  return <ProposalDateTimeField {...props} />;
}
