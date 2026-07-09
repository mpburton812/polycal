"use client";

import { Box } from "@mui/material";

import { EventCategoryIcon } from "@/lib/event-icons/EventCategoryIcon";
import { isEventIconKey } from "@/lib/event-icons/registry";

interface ProposalEventIconProps {
  eventIconKey: string | null | undefined;
  isContentMasked: boolean;
  proposalType: "event" | "sleeping";
  size?: number;
}

/**
 * Inline event category icon for proposal cards and detail (PC-116 phase 2).
 * Hidden when content is masked or no icon is set.
 */
export function ProposalEventIcon({
  eventIconKey,
  isContentMasked,
  proposalType,
  size = 22,
}: ProposalEventIconProps) {
  if (isContentMasked || proposalType !== "event" || !isEventIconKey(eventIconKey)) {
    return null;
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
