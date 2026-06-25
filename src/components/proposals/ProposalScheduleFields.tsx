"use client";

import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { DateTimePicker } from "@mui/x-date-pickers/DateTimePicker";
import { renderTimeViewClock } from "@mui/x-date-pickers/timeViewRenderers";
import dayjs, { type Dayjs } from "dayjs";

interface ScheduleFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
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
export function ProposalDateField({ label, value, onChange, disabled }: ScheduleFieldProps) {
  return (
    <DatePicker
      label={label}
      value={parseDateValue(value)}
      onChange={(next) => onChange(next?.isValid() ? next.format("YYYY-MM-DD") : "")}
      disabled={disabled}
      slotProps={textFieldSlotProps}
    />
  );
}

/**
 * Calendar + analog clock for event proposal start/end times (PC-48).
 */
export function ProposalDateTimeField({ label, value, onChange, disabled }: ScheduleFieldProps) {
  return (
    <DateTimePicker
      label={label}
      value={parseDateTimeValue(value)}
      onChange={(next) => onChange(next?.isValid() ? next.format("YYYY-MM-DDTHH:mm") : "")}
      disabled={disabled}
      ampm
      viewRenderers={{
        hours: renderTimeViewClock,
        minutes: renderTimeViewClock,
      }}
      slotProps={textFieldSlotProps}
    />
  );
}

interface ProposalScheduleFieldProps extends ScheduleFieldProps {
  mode: "date" | "datetime";
}

/** Date-only or date-time picker based on proposal type. */
export function ProposalScheduleField({ mode, ...props }: ProposalScheduleFieldProps) {
  if (mode === "date") {
    return <ProposalDateField {...props} />;
  }
  return <ProposalDateTimeField {...props} />;
}
