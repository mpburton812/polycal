"use client";

import { TextField, type TextFieldProps } from "@mui/material";
import { useEffect, useState } from "react";

import {
  commitIntegerDraft,
  liveIntegerFromDraft,
} from "@/lib/validation/clamped-number";

type ClampedNumberFieldProps = Omit<TextFieldProps, "type" | "value" | "onChange"> & {
  value: number;
  onChange: (next: number) => void;
  /** Called after blur/Enter with the clamped integer (for immediate persist). */
  onCommit?: (next: number) => void;
  min: number;
  max?: number;
};

/**
 * Number input that allows clearing/replacing the current digit (PC-519).
 * Parent state stays a number; the draft string is local while focused.
 */
export function ClampedNumberField({
  value,
  onChange,
  onCommit,
  min,
  max,
  onBlur,
  onFocus,
  onKeyDown,
  inputProps,
  ...rest
}: ClampedNumberFieldProps) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    if (!focused) setDraft(String(value));
  }, [value, focused]);

  function commit(raw: string) {
    const next = commitIntegerDraft(raw, min, max);
    onChange(next);
    onCommit?.(next);
    setDraft(String(next));
    setFocused(false);
  }

  return (
    <TextField
      {...rest}
      type="number"
      value={focused ? draft : String(value)}
      onFocus={(event) => {
        setFocused(true);
        setDraft(String(value));
        onFocus?.(event);
      }}
      onChange={(event) => {
        const raw = event.target.value;
        setDraft(raw);
        const live = liveIntegerFromDraft(raw, min, max);
        if (live !== null) onChange(live);
      }}
      onBlur={(event) => {
        commit(event.target.value);
        onBlur?.(event);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit((event.target as HTMLInputElement).value);
        }
        onKeyDown?.(event);
      }}
      inputProps={{ min, max, inputMode: "numeric", ...inputProps }}
    />
  );
}
