"use client";

import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Typography,
} from "@mui/material";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

import {
  adminFastAddSleepingPlanAction,
  listSleepingPartnersForUserAction,
} from "@/actions/admin-fast-sleeping";
import { listSleepingLocationOptionsAction, type ProposalConflictWarning } from "@/actions/proposals";
import type { AdminUserRow, PersonSummary } from "@/actions/users";
import { AdminCollapsibleSection } from "@/components/admin/AdminCollapsibleSection";
import { FastSleepingPlanGrid } from "@/components/proposals/FastSleepingPlanGrid";
import { useToast } from "@/components/providers/ToastProvider";
import {
  buildEmptyGridRows,
  fastSleepingRowHasContent,
  type FastSleepingRow,
} from "@/lib/proposals/fast-sleeping-plan";
import { GARDEN_TOKENS } from "@/theme/tokens";

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
 * Admin grid to fast-add a 14-night batch sleeping plan for a target user (PC-117).
 * Uses shared FastSleepingPlanGrid; force-resolves after conflict confirm.
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
  const [rows, setRows] = useState<FastSleepingRow[]>(() => buildEmptyGridRows());
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

  const configuredNightCount = rows.filter(fastSleepingRowHasContent).length;

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

      <FastSleepingPlanGrid
        rows={rows}
        onChange={setRows}
        partnerPeople={partners}
        locationOptions={locationOptions}
        disabled={pending || !targetUserId}
      />

      <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 2 }}>
        <Button
          variant="contained"
          onClick={() => handleSubmit(false)}
          disabled={pending || !targetUserId || configuredNightCount === 0}
        >
          {pending
            ? "Saving…"
            : `Add plan (${configuredNightCount} night${configuredNightCount === 1 ? "" : "s"})`}
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
