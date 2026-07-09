"use client";

import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

import {
  adminFastAddSleepingPlanAction,
  listSleepingPartnersForUserAction,
} from "@/actions/admin-fast-sleeping";
import type { AdminFastSleepingRow } from "@/lib/admin/fast-sleeping-plan";
import { listSleepingLocationOptionsAction, type ProposalConflictWarning } from "@/actions/proposals";
import type { AdminUserRow } from "@/actions/users";
import type { PersonSummary } from "@/actions/users";
import { AdminCollapsibleSection } from "@/components/admin/AdminCollapsibleSection";
import { useToast } from "@/components/providers/ToastProvider";
import { GARDEN_TOKENS } from "@/theme/tokens";

const GRID_DAYS = 14;

function formatGridDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatDayLabel(dateValue: string): string {
  const date = new Date(`${dateValue}T00:00:00`);
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function buildEmptyGridRows(): AdminFastSleepingRow[] {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return Array.from({ length: GRID_DAYS }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return {
      nightDate: formatGridDate(day),
      inviteeUserIds: [],
      intentionalSolo: false,
    };
  });
}

function ConflictWarningList({ warnings }: { warnings: ProposalConflictWarning[] }) {
  return (
    <>
      {warnings.map((warning, index) => (
        <Typography key={`${warning.userId}-${index}`} variant="body2" sx={{ mb: 0.5 }}>
          {warning.conflictKind === "place_asset" ? "Place" : warning.displayName} overlaps with
          &quot;{warning.conflictingTitle}&quot; ({warning.conflictingState})
        </Typography>
      ))}
    </>
  );
}

interface AdminFastSleepingPlanPanelProps {
  users: AdminUserRow[];
}

/**
 * Admin grid to fast-add a 14-night batch sleeping plan for a target user (PC-119).
 */
export function AdminFastSleepingPlanPanel({ users }: AdminFastSleepingPlanPanelProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();

  const activeUsers = useMemo(
    () => users.filter((user) => user.status === "active" && user.role !== "passive"),
    [users],
  );

  const [targetUserId, setTargetUserId] = useState("");
  const [rows, setRows] = useState<AdminFastSleepingRow[]>(buildEmptyGridRows);
  const [partners, setPartners] = useState<PersonSummary[]>([]);
  const [locationOptions, setLocationOptions] = useState<
    { id: string; name: string; bedroomCount: number; bedroomNames: string[] }[]
  >([]);
  const [conflictWarnings, setConflictWarnings] = useState<ProposalConflictWarning[]>([]);
  const [conflictDialogOpen, setConflictDialogOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadPartners() {
      if (!targetUserId) {
        setPartners([]);
        return;
      }
      const result = await listSleepingPartnersForUserAction(targetUserId);
      if (!cancelled) setPartners(result);
    }
    void loadPartners();
    return () => {
      cancelled = true;
    };
  }, [targetUserId]);

  useEffect(() => {
    let cancelled = false;
    async function loadLocations() {
      const options = await listSleepingLocationOptionsAction([]);
      if (!cancelled) setLocationOptions(options);
    }
    void loadLocations();
    return () => {
      cancelled = true;
    };
  }, []);

  function updateRow(index: number, patch: Partial<AdminFastSleepingRow>) {
    setRows((current) => {
      const next = [...current];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  }

  function togglePartner(index: number, partnerId: string) {
    const row = rows[index];
    if (!row || row.intentionalSolo) return;
    const hasPartner = row.inviteeUserIds.includes(partnerId);
    const inviteeUserIds = hasPartner
      ? row.inviteeUserIds.filter((id) => id !== partnerId)
      : [...row.inviteeUserIds, partnerId];
    updateRow(index, { inviteeUserIds });
  }

  function handleSubmit(confirm = false) {
    if (!targetUserId) {
      showToast("Select a target user.", "error");
      return;
    }

    startTransition(async () => {
      const result = await adminFastAddSleepingPlanAction({
        targetUserId,
        rows,
        confirm,
      });

      if (!result.ok && result.warnings && result.warnings.length > 0) {
        setConflictWarnings(result.warnings);
        setConflictDialogOpen(true);
        return;
      }

      if (!result.ok) {
        showToast(result.message, "error");
        return;
      }

      setConflictWarnings([]);
      setConflictDialogOpen(false);
      showToast(result.message, "success");
      setRows(buildEmptyGridRows());
      router.refresh();
    });
  }

  const configuredNightCount = rows.filter(
    (row) =>
      row.intentionalSolo ||
      row.inviteeUserIds.length > 0 ||
      row.locationId ||
      row.locationText?.trim(),
  ).length;

  return (
    <AdminCollapsibleSection title="Fast sleeping plan add">
      <Typography variant="body2" sx={{ mb: 2, color: GARDEN_TOKENS.inkMuted }}>
        Schedule up to 14 nights of sleeping arrangements for a user — created as one resolved
        batch proposal (no voting). Conflicts warn before finalizing.
      </Typography>

      <Stack spacing={2} sx={{ mb: 2 }}>
        <FormControl fullWidth size="small">
          <InputLabel id="fast-sleeping-target-user">Target user</InputLabel>
          <Select
            labelId="fast-sleeping-target-user"
            label="Target user"
            value={targetUserId}
            onChange={(event) => setTargetUserId(event.target.value)}
          >
            <MenuItem value="">Select user…</MenuItem>
            {activeUsers.map((user) => (
              <MenuItem key={user.id} value={user.id}>
                {user.displayName} ({user.username})
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {targetUserId && partners.length === 0 && (
          <Alert severity="info">
            This user has no accepted sleeping partners. Use intentional solo for each night, or add
            partnerships first.
          </Alert>
        )}
      </Stack>

      <Box sx={{ overflowX: "auto" }}>
        <Table size="small" sx={{ minWidth: 720 }}>
          <TableHead>
            <TableRow>
              <TableCell>Day / date</TableCell>
              <TableCell>Partners</TableCell>
              <TableCell>Location</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={row.nightDate}>
                <TableCell sx={{ whiteSpace: "nowrap", verticalAlign: "top" }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {formatDayLabel(row.nightDate)}
                  </Typography>
                </TableCell>
                <TableCell sx={{ verticalAlign: "top", minWidth: 200 }}>
                  <ToggleButtonGroup
                    exclusive
                    value={row.intentionalSolo ? "solo" : "network"}
                    onChange={(_, value) => {
                      if (!value) return;
                      const solo = value === "solo";
                      updateRow(index, {
                        intentionalSolo: solo,
                        inviteeUserIds: solo ? [] : row.inviteeUserIds,
                      });
                    }}
                    size="small"
                    sx={{ mb: 1 }}
                  >
                    <ToggleButton value="solo">Solo</ToggleButton>
                    <ToggleButton value="network">Partners</ToggleButton>
                  </ToggleButtonGroup>
                  {!row.intentionalSolo && (
                    <Stack direction="row" flexWrap="wrap" gap={0.5}>
                      {partners.map((partner) => {
                        const selected = row.inviteeUserIds.includes(partner.id);
                        return (
                          <Chip
                            key={partner.id}
                            label={partner.displayName}
                            size="small"
                            color={selected ? "primary" : "default"}
                            variant={selected ? "filled" : "outlined"}
                            onClick={() => togglePartner(index, partner.id)}
                            sx={{ cursor: "pointer" }}
                          />
                        );
                      })}
                    </Stack>
                  )}
                </TableCell>
                <TableCell sx={{ verticalAlign: "top", minWidth: 220 }}>
                  <FormControl fullWidth size="small" sx={{ mb: 1 }}>
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
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>

      <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 2 }}>
        <Button
          variant="contained"
          onClick={() => handleSubmit(false)}
          disabled={pending || !targetUserId || configuredNightCount === 0}
        >
          {pending ? "Saving…" : `Add plan (${configuredNightCount} night${configuredNightCount === 1 ? "" : "s"})`}
        </Button>
        <Typography variant="caption" color="text.secondary">
          Empty rows are skipped.
        </Typography>
      </Stack>

      <Dialog
        open={conflictDialogOpen}
        onClose={() => setConflictDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <WarningAmberIcon color="warning" />
          Schedule conflicts
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 1 }}>
            The following overlaps were detected. You can still add the plan if intentional.
          </Typography>
          <ConflictWarningList warnings={conflictWarnings} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConflictDialogOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="warning"
            onClick={() => {
              setConflictDialogOpen(false);
              handleSubmit(true);
            }}
            disabled={pending}
          >
            Add anyway
          </Button>
        </DialogActions>
      </Dialog>
    </AdminCollapsibleSection>
  );
}
