"use client";

import { Box, Stack, Typography } from "@mui/material";

import {
  EVENT_SCHEDULE_COLOR_KEYS,
  EVENT_SCHEDULE_COLORS,
  type EventScheduleColorKey,
} from "@/lib/schedule/event-colors";
import { GARDEN_TOKENS } from "@/theme/tokens";

/**
 * Shared event color. Red and purple are omitted — they mark conflict and sleeping (PC-527).
 */
export function EventColorPicker({
  value,
  onChange,
  disabled,
}: {
  value: EventScheduleColorKey | null;
  onChange: (next: EventScheduleColorKey) => void;
  disabled?: boolean;
}) {
  return (
    <Stack spacing={0.75}>
      <Typography variant="body2" sx={{ fontWeight: 600, color: GARDEN_TOKENS.ink }}>
        Color
      </Typography>
      <Stack direction="row" spacing={1} role="radiogroup" aria-label="Event color">
        {EVENT_SCHEDULE_COLOR_KEYS.map((key) => {
          const color = EVENT_SCHEDULE_COLORS[key];
          const selected = value === key;
          return (
            <Box
              key={key}
              component="button"
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={color.label}
              disabled={disabled}
              onClick={() => onChange(key)}
              sx={{
                width: 32,
                height: 32,
                p: 0,
                borderRadius: "50%",
                bgcolor: color.fill,
                border: selected
                  ? `3px solid ${GARDEN_TOKENS.ink}`
                  : `2px solid ${GARDEN_TOKENS.outlineSoft}`,
                cursor: disabled ? "default" : "pointer",
              }}
            />
          );
        })}
      </Stack>
    </Stack>
  );
}
