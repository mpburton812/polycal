"use client";

import DownloadIcon from "@mui/icons-material/Download";
import { Button, type ButtonProps } from "@mui/material";

import { GARDEN_TOKENS } from "@/theme/tokens";

type DownloadIcsButtonProps = {
  pendingIcsId: string;
  size?: ButtonProps["size"];
  variant?: ButtonProps["variant"];
  /** Stop click bubbling (kanban card open). */
  stopPropagation?: boolean;
  sx?: ButtonProps["sx"];
};

/**
 * Downloads a queued ICS file via the authenticated calendar API (PC-345).
 * Remains available after the first download — the API re-serves the same pending row.
 */
export function DownloadIcsButton({
  pendingIcsId,
  size = "small",
  variant = "outlined",
  stopPropagation = false,
  sx,
}: DownloadIcsButtonProps) {
  return (
    <Button
      component="a"
      href={`/api/calendar/ics/${pendingIcsId}`}
      download
      size={size}
      variant={variant}
      startIcon={<DownloadIcon />}
      aria-label="Download ICS"
      onClick={(event) => {
        if (stopPropagation) {
          event.stopPropagation();
        }
      }}
      sx={{
        border: `2px solid ${GARDEN_TOKENS.ink}`,
        color: GARDEN_TOKENS.ink,
        boxShadow: "none",
        textTransform: "none",
        ...((sx as object) ?? {}),
      }}
    >
      Download ICS
    </Button>
  );
}
