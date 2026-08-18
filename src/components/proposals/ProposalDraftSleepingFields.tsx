"use client";

import AccessTimeIcon from "@mui/icons-material/AccessTime";
import {
  Box,
  Checkbox,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Typography,
} from "@mui/material";

import type { ProposalPlaceOption } from "@/actions/proposals";
import type { PersonSummary } from "@/actions/users";
import type { BatchSleepingEntry } from "@/lib/proposals/batch-sleeping";
import { inviteeIsSelected } from "@/lib/proposals/invitee-tap-cycle";
import type { FastSleepingRow } from "@/lib/proposals/fast-sleeping-plan";

import { FastSleepingPlanGrid } from "./FastSleepingPlanGrid";
import { ProposalDateRangeField } from "./ProposalDateRangeField";
import { ProposalDraftSectionHeader } from "./ProposalDraftSectionHeader";
import { ProposalDraftWhereButtons } from "./ProposalDraftWhereButtons";
import { ProposalDraftWhoRow } from "./ProposalDraftWhoRow";
import { POLY_GREEN, POLY_GREEN_LIGHT } from "./proposalCardTheme";
import type { InviteeSelection, SlotDraft } from "./proposalDraftDateUtils";

export interface ProposalDraftSleepingFieldsProps {
  batchMode: boolean;
  onBatchModeChange: (value: boolean) => void;
  fastPlanRows: FastSleepingRow[];
  onFastPlanRowsChange: (rows: FastSleepingRow[]) => void;
  sleepingCandidates: PersonSummary[];
  batchLocationOptions: ProposalPlaceOption[];
  configuredBatchEntries: BatchSleepingEntry[];
  people: PersonSummary[];
  viewerId: string;
  onBehalfOfUserId?: string;
  locationOptions: ProposalPlaceOption[];
  pending: boolean;
  postingKind: "proposal" | "booking";
  showLocation?: boolean;
  showInvitees?: boolean;
  candidates: PersonSummary[];
  inviteeMode: Record<string, InviteeSelection>;
  setInviteeRole: (personId: string, role: InviteeSelection) => void;
  slots: SlotDraft[];
  onSlotsChange: (slots: SlotDraft[]) => void;
  locationId: string;
  locationCustom: string;
  bedroomIndex: number | "";
  bedroomOptions: { index: number; label: string }[];
  onLocationIdChange: (value: string) => void;
  onLocationCustomChange: (value: string) => void;
  onBedroomIndexChange: (value: number | "") => void;
}

/**
 * Sleeping happy-path fields: batch grid or who/night/where (PC-132).
 */
export function ProposalDraftSleepingFields({
  batchMode,
  onBatchModeChange,
  fastPlanRows,
  onFastPlanRowsChange,
  sleepingCandidates,
  batchLocationOptions,
  configuredBatchEntries,
  people,
  viewerId,
  onBehalfOfUserId,
  locationOptions,
  pending,
  postingKind,
  showLocation = true,
  showInvitees = true,
  candidates,
  inviteeMode,
  setInviteeRole,
  slots,
  onSlotsChange,
  locationId,
  locationCustom,
  bedroomIndex,
  bedroomOptions,
  onLocationIdChange,
  onLocationCustomChange,
  onBedroomIndexChange,
}: ProposalDraftSleepingFieldsProps) {
  return (
    <Stack spacing={2} sx={{ mb: 2 }}>
      <FormControlLabel
        control={
          <Checkbox
            checked={batchMode}
            onChange={(event) => onBatchModeChange(event.target.checked)}
            sx={{ color: POLY_GREEN, "&.Mui-checked": { color: POLY_GREEN } }}
          />
        }
        label="Batch nights (plan up to 14 nights in one proposal)"
      />

      {batchMode ? (
        <>
          <ProposalDraftSectionHeader
            icon={<AccessTimeIcon fontSize="small" />}
            title="Batch nights"
            subtitle="Empty nights are skipped. Mark partners required or optional."
          />
          <FastSleepingPlanGrid
            rows={fastPlanRows}
            onChange={onFastPlanRowsChange}
            partnerPeople={sleepingCandidates}
            locationOptions={batchLocationOptions}
            disabled={pending}
          />
          {configuredBatchEntries.length > 0 && (
            <Box sx={{ p: 1.5, bgcolor: POLY_GREEN_LIGHT, borderRadius: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                Proposed nights summary ({configuredBatchEntries.length})
              </Typography>
              <Stack spacing={0.75}>
                {configuredBatchEntries.map((entry, index) => {
                  const place =
                    locationOptions.find((p) => p.id === entry.locationId)?.name ??
                    entry.locationText ??
                    "No location";
                  const inviteeLabels = entry.intentionalSolo
                    ? ["Solo"]
                    : entry.invitees.map((invitee) => {
                        const person = people.find((p) => p.id === invitee.userId);
                        return person ? person.displayName : invitee.userId;
                      });
                  return (
                    <Typography key={entry.id} variant="body2" sx={{ color: POLY_GREEN }}>
                      Night {index + 1}: {entry.nightDate.slice(0, 10)} · {place}
                      {inviteeLabels.length > 0 ? ` · ${inviteeLabels.join(", ")}` : ""}
                    </Typography>
                  );
                })}
              </Stack>
            </Box>
          )}
        </>
      ) : (
        <>
          <ProposalDraftSectionHeader
            icon={<AccessTimeIcon fontSize="small" />}
            title="Night"
            subtitle="Tap a night or drag a range — earliest is start, latest is end"
          />
          {slots.map((slot, index) => (
            <ProposalDateRangeField
              key={`sleep-slot-${index}`}
              startLabel="Night of"
              endLabel="Last night"
              startValue={slot.startAt}
              endValue={slot.endAt}
              onRangeChange={(start, end) => {
                const updated = [...slots];
                updated[index] = {
                  ...updated[index],
                  startAt: start,
                  endAt: end || start,
                };
                onSlotsChange(updated);
              }}
              helperText="Leave as a single day for one night"
            />
          ))}

          {showInvitees ? (
            <ProposalDraftWhoRow
              candidates={candidates}
              inviteeMode={inviteeMode}
              setInviteeRole={setInviteeRole}
              postingKind={postingKind}
            />
          ) : null}

          {showLocation ? (
            <>
              <ProposalDraftWhereButtons
                places={locationOptions}
                people={people}
                viewerId={viewerId}
                selectedUserIds={Object.entries(inviteeMode)
                  .filter(([, role]) => inviteeIsSelected(role))
                  .map(([id]) => id)}
                onBehalfOfUserId={onBehalfOfUserId}
                locationId={locationId}
                locationCustom={locationCustom}
                onLocationIdChange={onLocationIdChange}
                onLocationCustomChange={onLocationCustomChange}
                onClearBedroom={() => onBedroomIndexChange("")}
              />
              {bedroomOptions.length > 0 && (
                <FormControl fullWidth size="small">
                  <InputLabel id="proposal-bedroom-label">Bedroom</InputLabel>
                  <Select
                    labelId="proposal-bedroom-label"
                    label="Bedroom"
                    value={bedroomIndex === "" ? "" : String(bedroomIndex)}
                    onChange={(event) => {
                      const value = event.target.value;
                      onBedroomIndexChange(value === "" ? "" : Number(value));
                    }}
                  >
                    <MenuItem value="">Any / whole place</MenuItem>
                    {bedroomOptions.map((bedroom) => (
                      <MenuItem key={bedroom.index} value={String(bedroom.index)}>
                        {bedroom.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            </>
          ) : null}
        </>
      )}
    </Stack>
  );
}
