"use client";

import { Box, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";

import { EventCategoryIcon } from "@/lib/event-icons/EventCategoryIcon";
import {
  EVENT_ICON_REGISTRY,
  type EventIconKey,
} from "@/lib/event-icons/registry";
import { POLY_GREEN } from "@/components/proposals/proposalCardTheme";

interface EventIconPickerProps {
  value: EventIconKey | null;
  onChange: (value: EventIconKey | null) => void;
}

/**
 * Optional single-select grid for choosing an event category icon (PC-116).
 */
export function EventIconPicker({ value, onChange }: EventIconPickerProps) {
  return (
    <Box data-testid="event-icon-picker">
      <ToggleButtonGroup
        exclusive
        value={value ?? ""}
        onChange={(_, next: EventIconKey | "") => {
          onChange(next === "" ? null : next);
        }}
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(88px, 1fr))",
          gap: 0.5,
          width: "100%",
          "& .MuiToggleButtonGroup-grouped": {
            border: "1px solid",
            borderColor: "divider",
            borderRadius: "8px !important",
            margin: 0,
            py: 0.5,
            px: 0.5,
          },
          "& .MuiToggleButton-root.Mui-selected": {
            bgcolor: POLY_GREEN,
            color: "#fff",
            borderColor: POLY_GREEN,
            "&:hover": { bgcolor: POLY_GREEN },
          },
        }}
      >
        <ToggleButton value="" aria-label="No event icon">
          <Typography variant="caption">None</Typography>
        </ToggleButton>
        {EVENT_ICON_REGISTRY.map((entry) => (
          <ToggleButton key={entry.key} value={entry.key} aria-label={entry.a11yLabel}>
            <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0.25 }}>
              <EventCategoryIcon iconKey={entry.key} labeled sx={{ fontSize: 24 }} />
              <Typography variant="caption" sx={{ lineHeight: 1.1, textAlign: "center" }}>
                {entry.label}
              </Typography>
            </Box>
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    </Box>
  );
}
