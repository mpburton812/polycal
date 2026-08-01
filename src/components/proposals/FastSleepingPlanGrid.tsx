"use client";

import {
  Box,
  Button,
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
  createEmptyFastSleepingRow,
  FAST_SLEEPING_MAX_SLOTS,
  formatFastSleepingDayLabel,
  type FastSleepingRow,
} from "@/lib/proposals/fast-sleeping-plan";
import { LONG_TEXT_MAX, SHORT_TEXT_MAX } from "@/lib/validation/string-limits";
import { GARDEN_TOKENS } from "@/theme/tokens";

export interface FastSleepingPlanGridProps {
  rows: FastSleepingRow[];
  onChange: (rows: FastSleepingRow[]) => void;
  partnerPeople: PersonSummary[];
  locationOptions: ProposalPlaceOption[];
  disabled?: boolean;
  /**
   * FastSleep mode: per-night proposer picker + partners for the selected proposer.
   * When omitted, behaves as legacy admin/user batch grid (partners of one subject).
   */
  subjectPeople?: PersonSummary[];
  partnersBySubjectId?: Record<string, PersonSummary[]>;
  defaultSubjectUserId?: string;
  /** Hide required/optional role toggles (FastSleep auto-accepts). */
  hideInviteeRoles?: boolean;
}

/**
 * Shared fast sleeping plan grid (PC-116 / PC-380 / PC-383).
 * Each slot is a bordered box; FastSleep mode allows multiple slots on the same night.
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

  function addSlotForNight(index: number) {
    if (disabled || rows.length >= FAST_SLEEPING_MAX_SLOTS) return;
    const row = rows[index];
    if (!row) return;
    const next = [...rows];
    next.splice(
      index + 1,
      0,
      createEmptyFastSleepingRow(row.nightDate, defaultSubjectUserId),
    );
    onChange(next);
  }

  function removeSlot(index: number) {
    if (disabled) return;
    const row = rows[index];
    if (!row) return;
    const sameDateCount = rows.filter((r) => r.nightDate === row.nightDate).length;
    if (sameDateCount <= 1) return;
    onChange(rows.filter((_, i) => i !== index));
  }

  function slotIndexForDate(row: FastSleepingRow, index: number): number {
    let n = 0;
    for (let i = 0; i <= index; i += 1) {
      if (rows[i]?.nightDate === row.nightDate) n += 1;
    }
    return n;
  }

  function sameDateCount(nightDate: string): number {
    return rows.filter((r) => r.nightDate === nightDate).length;
  }

  return (
    <Stack spacing={1.5} data-testid="fast-sleeping-plan-grid">
      {rows.map((row, index) => {
        const nightPartners = partnersForRow(row);
        const rowKey = row.id ?? `${row.nightDate}-${index}`;
        const slotN = slotIndexForDate(row, index);
        const multiOnDate = sameDateCount(row.nightDate) > 1;
        return (
          <Box
            key={rowKey}
            data-testid={`fast-sleep-night-${row.nightDate}`}
            data-slot-index={slotN}
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
                  {multiOnDate ? ` · slot ${slotN}` : ""}
                </Typography>
                {subjectMode ? (
                  <FormControl fullWidth size="small" sx={{ mb: 1 }} disabled={disabled}>
                    <InputLabel id={`fast-sleep-subject-${index}`}>Proposer</InputLabel>
                    <Select
                      labelId={`fast-sleep-subject-${index}`}
                      label="Proposer"
                      value={row.subjectUserId ?? defaultSubjectUserId ?? ""}
                      onChange={(event) => {
                        const subjectUserId = event.target.value || undefined;
                        updateRow(index, {
                          subjectUserId,
                          inviteeUserIds: [],
                          inviteeRoles: {},
                        });
                      }}
                      inputProps={{
                        "data-testid": `fast-sleep-subject-${row.nightDate}-${slotN}`,
                      }}
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
                  sx={{ mb: 1 }}
                  inputProps={{ maxLength: SHORT_TEXT_MAX }}
                />
                <TextField
                  label="Note"
                  value={row.comment ?? ""}
                  onChange={(event) =>
                    updateRow(index, {
                      comment: event.target.value || undefined,
                    })
                  }
                  fullWidth
                  size="small"
                  multiline
                  minRows={2}
                  placeholder="Optional note for this night"
                  disabled={disabled}
                  inputProps={{
                    maxLength: LONG_TEXT_MAX,
                    "data-testid": `fast-sleep-note-${row.nightDate}-${slotN}`,
                  }}
                />
              </Box>
            </Box>

            {subjectMode ? (
              <Stack direction="row" spacing={1} sx={{ mt: 1.5 }} flexWrap="wrap">
                <Button
                  size="small"
                  variant="outlined"
                  disabled={disabled || rows.length >= FAST_SLEEPING_MAX_SLOTS}
                  onClick={() => addSlotForNight(index)}
                  data-testid={`fast-sleep-add-slot-${row.nightDate}`}
                >
                  Add another for this night
                </Button>
                {multiOnDate ? (
                  <Button
                    size="small"
                    color="inherit"
                    disabled={disabled}
                    onClick={() => removeSlot(index)}
                    data-testid={`fast-sleep-remove-slot-${row.nightDate}-${slotN}`}
                  >
                    Remove this slot
                  </Button>
                ) : null}
              </Stack>
            ) : null}
          </Box>
        );
      })}
    </Stack>
  );
}
