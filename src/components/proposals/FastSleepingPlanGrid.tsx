"use client";

import {
  Box,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";

import type { PersonSummary } from "@/actions/users";
import type { ProposalPlaceOption } from "@/actions/proposals";
import {
  formatFastSleepingDayLabel,
  type FastSleepingRow,
} from "@/lib/proposals/fast-sleeping-plan";
import { SHORT_TEXT_MAX } from "@/lib/validation/string-limits";
import { GARDEN_TOKENS } from "@/theme/tokens";

export interface FastSleepingPlanGridProps {
  rows: FastSleepingRow[];
  onChange: (rows: FastSleepingRow[]) => void;
  partnerPeople: PersonSummary[];
  locationOptions: ProposalPlaceOption[];
  disabled?: boolean;
}

/**
 * Shared 14-night fast sleeping plan grid (PC-116).
 * Each night is a bordered box; fields wrap inside the box so Location stacks
 * under Day/Partners on narrow widths without horizontal scrolling.
 */
export function FastSleepingPlanGrid({
  rows,
  onChange,
  partnerPeople,
  locationOptions,
  disabled = false,
}: FastSleepingPlanGridProps) {
  function updateRow(index: number, patch: Partial<FastSleepingRow>) {
    const next = [...rows];
    next[index] = { ...next[index]!, ...patch };
    onChange(next);
  }

  function togglePartner(index: number, partnerId: string) {
    const row = rows[index];
    if (!row || row.intentionalSolo || disabled) return;
    const hasPartner = row.inviteeUserIds.includes(partnerId);
    const inviteeUserIds = hasPartner
      ? row.inviteeUserIds.filter((id) => id !== partnerId)
      : [...row.inviteeUserIds, partnerId];
    const inviteeRoles: Record<string, "required" | "optional"> = {
      ...(row.inviteeRoles ?? {}),
    };
    if (hasPartner) {
      delete inviteeRoles[partnerId];
    } else {
      // Default new partners to optional so nights can submit without blocking (PC-374).
      inviteeRoles[partnerId] = "optional";
    }
    updateRow(index, { inviteeUserIds, inviteeRoles });
  }

  function setPartnerRole(
    index: number,
    partnerId: string,
    role: "required" | "optional",
  ) {
    const row = rows[index];
    if (!row || row.intentionalSolo || disabled) return;
    if (!row.inviteeUserIds.includes(partnerId)) return;
    updateRow(index, {
      inviteeRoles: { ...(row.inviteeRoles ?? {}), [partnerId]: role },
    });
  }

  return (
    <Stack spacing={1.5} data-testid="fast-sleeping-plan-grid">
      {rows.map((row, index) => (
        <Box
          key={row.nightDate}
          data-testid={`fast-sleep-night-${row.nightDate}`}
          sx={{
            border: `1px solid ${GARDEN_TOKENS.outlineSoft}`,
            borderRadius: 1,
            p: 1.5,
            bgcolor: GARDEN_TOKENS.surface,
          }}
        >
          <Box
            sx={{
              display: "flex",
              flexWrap: "wrap",
              gap: 1.5,
              alignItems: "flex-start",
            }}
          >
            <Box sx={{ flex: "1 1 140px", minWidth: 120 }}>
              <Typography variant="body2" sx={{ fontWeight: 700, mb: 1 }}>
                {formatFastSleepingDayLabel(row.nightDate)}
              </Typography>
              <ToggleButtonGroup
                exclusive
                value={row.intentionalSolo ? "solo" : "network"}
                onChange={(_, value) => {
                  if (!value || disabled) return;
                  const solo = value === "solo";
                  updateRow(index, {
                    intentionalSolo: solo,
                    inviteeUserIds: solo ? [] : row.inviteeUserIds,
                  });
                }}
                size="small"
                disabled={disabled}
                sx={{ mb: 1 }}
              >
                <ToggleButton value="solo">Solo</ToggleButton>
                <ToggleButton value="network">Partners</ToggleButton>
              </ToggleButtonGroup>
              {!row.intentionalSolo && (
                <Stack direction="column" gap={0.75}>
                  {partnerPeople.length === 0 ? (
                    <Typography variant="caption" color="text.secondary">
                      No sleeping partners
                    </Typography>
                  ) : (
                    partnerPeople.map((partner) => {
                      const selected = row.inviteeUserIds.includes(partner.id);
                      const role = row.inviteeRoles?.[partner.id] ?? "optional";
                      return (
                        <Stack
                          key={partner.id}
                          direction="row"
                          flexWrap="wrap"
                          gap={0.5}
                          alignItems="center"
                        >
                          <Chip
                            label={partner.displayName}
                            size="small"
                            color={selected ? "primary" : "default"}
                            variant={selected ? "filled" : "outlined"}
                            onClick={() => togglePartner(index, partner.id)}
                            disabled={disabled}
                            sx={{ cursor: disabled ? "default" : "pointer" }}
                          />
                          {selected ? (
                            <ToggleButtonGroup
                              exclusive
                              size="small"
                              value={role}
                              disabled={disabled}
                              onChange={(_, value) => {
                                if (value === "required" || value === "optional") {
                                  setPartnerRole(index, partner.id, value);
                                }
                              }}
                              aria-label={`${partner.displayName} invite role`}
                            >
                              <ToggleButton
                                value="optional"
                                aria-label={`${partner.displayName} optional`}
                              >
                                Optional
                              </ToggleButton>
                              <ToggleButton
                                value="required"
                                aria-label={`${partner.displayName} required`}
                              >
                                Required
                              </ToggleButton>
                            </ToggleButtonGroup>
                          ) : null}
                        </Stack>
                      );
                    })
                  )}
                </Stack>
              )}
            </Box>

            <Box sx={{ flex: "1 1 220px", minWidth: 180 }}>
              <FormControl fullWidth size="small" sx={{ mb: 1 }} disabled={disabled}>
                <InputLabel id={`fast-sleep-loc-${index}`}>Place</InputLabel>
                <Select
                  labelId={`fast-sleep-loc-${index}`}
                  label="Place"
                  value={row.locationId ?? ""}
                  onChange={(event) => {
                    const value = event.target.value;
                    updateRow(index, {
                      locationId: value || undefined,
                      locationText: value ? undefined : row.locationText,
                    });
                  }}
                >
                  <MenuItem value="">None</MenuItem>
                  {locationOptions.map((place) => (
                    <MenuItem key={place.id} value={place.id}>
                      {place.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                label="Custom location"
                value={row.locationText ?? ""}
                onChange={(event) =>
                  updateRow(index, {
                    locationText: event.target.value || undefined,
                    locationId: event.target.value ? undefined : row.locationId,
                  })
                }
                fullWidth
                size="small"
                placeholder="Optional"
                disabled={disabled}
                inputProps={{ maxLength: SHORT_TEXT_MAX }}
              />
            </Box>
          </Box>
        </Box>
      ))}
    </Stack>
  );
}
