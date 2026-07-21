"use client";

import { Box } from "@mui/material";

import { EventCategoryIcon } from "@/lib/event-icons/EventCategoryIcon";
import { isEventIconKey } from "@/lib/event-icons/registry";

interface ProposalEventIconProps {
  eventIconKey: string | null | undefined;
  isContentMasked: boolean;
  proposalType: "event" | "sleeping";
  size?: number;
  /** Stretch to parent height for kanban card watermarks (PC-275). */
  fillHeight?: boolean;
}

/**
 * Event category icon for proposal cards and detail (PC-116 / PC-275).
 * Hidden when content is masked or no icon is set.
 */
export function ProposalEventIcon({
  eventIconKey,
  isContentMasked,
  proposalType,
  size = 22,
  fillHeight = false,
}: ProposalEventIconProps) {
  if (isContentMasked || proposalType !== "event" || !isEventIconKey(eventIconKey)) {
    return null;
  }

  if (fillHeight) {
    return (
      <Box
        sx={{
          height: "100%",
          width: "auto",
          aspectRatio: "1 / 1",
          maxWidth: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
        }}
      >
        <EventCategoryIcon
          iconKey={eventIconKey}
          sx={{ height: "100%", width: "100%", display: "block" }}
        />
      </Box>
    );
  }

  return (
    <Box
      component="span"
      sx={{
        display: "inline-flex",
        alignItems: "center",
        color: "text.secondary",
        flexShrink: 0,
      }}
    >
      <EventCategoryIcon iconKey={eventIconKey} labeled sx={{ fontSize: size }} />
    </Box>
  );
}
