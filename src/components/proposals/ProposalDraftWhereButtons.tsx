"use client";

import LocationOnOutlinedIcon from "@mui/icons-material/LocationOnOutlined";
import { Button, Stack, TextField } from "@mui/material";

import type { ProposalPlaceOption } from "@/actions/proposals";
import type { PersonSummary } from "@/actions/users";
import { buildQuickLocationButtons } from "@/lib/proposals/quick-location-buttons";
import { SHORT_TEXT_MAX } from "@/lib/validation/string-limits";

import { ProposalDraftSectionHeader } from "./ProposalDraftSectionHeader";
import { POLY_GREEN, POLY_GREEN_HOVER } from "./proposalCardTheme";

/**
 * Context-aware home buttons plus a custom location field (PC-436).
 */
export function ProposalDraftWhereButtons({
  places,
  people,
  viewerId,
  selectedUserIds,
  onBehalfOfUserId,
  locationId,
  locationCustom,
  onLocationIdChange,
  onLocationCustomChange,
  onClearBedroom,
}: {
  places: ProposalPlaceOption[];
  people: PersonSummary[];
  viewerId: string;
  selectedUserIds: string[];
  onBehalfOfUserId?: string;
  locationId: string;
  locationCustom: string;
  onLocationIdChange: (value: string) => void;
  onLocationCustomChange: (value: string) => void;
  onClearBedroom: () => void;
}) {
  const buttons = buildQuickLocationButtons({
    places: places.map((place) => ({
      id: place.id,
      name: place.name,
      residentUserIds: place.residentUserIds ?? [],
    })),
    people,
    viewerId,
    selectedUserIds,
    onBehalfOfUserId,
  });

  return (
    <Stack spacing={1}>
      <ProposalDraftSectionHeader
        icon={<LocationOnOutlinedIcon fontSize="small" />}
        title="Where"
        subtitle="Homes of selected people, or type a custom place"
      />
      {buttons.length > 0 ? (
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
          {buttons.map((button) => {
            const selected = locationId === button.locationId;
            return (
              <Button
                key={button.locationId}
                size="small"
                variant={selected ? "contained" : "outlined"}
                aria-pressed={selected}
                onClick={() => {
                  if (selected) {
                    onLocationIdChange("");
                    return;
                  }
                  onLocationIdChange(button.locationId);
                  onLocationCustomChange("");
                  onClearBedroom();
                }}
                sx={{
                  borderColor: POLY_GREEN,
                  color: selected ? "#fff" : POLY_GREEN,
                  bgcolor: selected ? POLY_GREEN : "transparent",
                  "&:hover": {
                    bgcolor: selected ? POLY_GREEN_HOVER : "rgba(107, 143, 113, 0.08)",
                    borderColor: POLY_GREEN,
                  },
                }}
              >
                {button.label}
              </Button>
            );
          })}
        </Stack>
      ) : null}
      <TextField
        label="Custom location (optional)"
        value={locationCustom}
        onChange={(event) => {
          onLocationCustomChange(event.target.value);
          if (event.target.value) {
            onLocationIdChange("");
            onClearBedroom();
          }
        }}
        fullWidth
        size="small"
        placeholder="Restaurant or other place"
        inputProps={{ maxLength: SHORT_TEXT_MAX }}
      />
    </Stack>
  );
}
