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
  /**
   * FastSleep mode: per-night subject picker + partners for the selected subject.
   * When omitted, behaves as legacy admin/user batch grid (partners of one subject).
   */
  subjectPeople?: PersonSummary[];
  partnersBySubjectId?: Record<string, PersonSummary[]>;
  defaultSubjectUserId?: string;
  /** Hide required/optional role toggles (FastSleep auto-accepts). */
  hideInviteeRoles?: boolean;
}

/**
 * Shared 14-night fast sleeping plan grid (PC-116 / PC-380).
 * Each night is a bordered box; fields wrap inside the box so Location stacks
 * under Day/Partners on narrow widths without horizontal scrolling.
 */
export function FastSleepingPlanGrid({
  rows,
  onChange,
  partnerPeople,
  locationOptions,
  disabled = false,
  subjectPeople,
  partnersBySubjectId,
  defaultSubjectUserId,
  hideInviteeRoles = false,
}: FastSleepingPlanGridProps) {
  const subjectMode = Boolean(subjectPeople && subjectPeople.length > 0);

  function updateRow(index: number, patch: Partial<FastSleepingRow>) {
    const next = [...rows];
    next[index] = { ...next[index]!, ...patch };
    onChange(next);
  }

  function partnersForRow(row: FastSleepingRow): PersonSummary[] {
    if (!subjectMode) return partnerPeople;
    const subjectId = row.subjectUserId ?? defaultSubjectUserId;
    if (!subjectId) return [];
    return partnersBySubjectId?.[subjectId] ?? [];
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
      {rows.map((row, index) => {
        const nightPartners = partnersForRow(row);
        return (
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
                {subjectMode ? (
                  <FormControl fullWidth size="small" sx={{ mb: 1 }} disabled={disabled}>
                    <InputLabel id={`fast-sleep-subject-${index}`}>Subject</InputLabel>
                    <Select
                      labelId={`fast-sleep-subject-${index}`}
                      label="Subject"
                      value={row.subjectUserId ?? defaultSubjectUserId ?? ""}
                      onChange={(event) => {
                        const subjectUserId = event.target.value || undefined;
                        updateRow(index, {
                          subjectUserId,
                          inviteeUserIds: [],
                          inviteeRoles: {},
                        });
                      }}
                      inputProps={{ "data-testid": `fast-sleep-subject-${row.nightDate}` }}
                    >
                      {(subjectPeople ?? []).map((person) => (
                        <MenuItem key={person.id} value={person.id}>
                          {person.displayName}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                ) : null}
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
                    {nightPartners.length === 0 ? (
                      <Typography variant="caption" color="text.secondary">
                        No sleeping partners
                      </Typography>
                    ) : (
                      nightPartners.map((partner) => {
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
                            {selected && !hideInviteeRoles ? (
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
        );
      })}
    </Stack>
  );
}
