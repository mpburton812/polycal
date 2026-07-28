"use client";

import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from "@mui/material";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  createFastSleepProposalAction,
  listFastSleepGraphAction,
  type FastSleepGraphPerson,
} from "@/actions/fast-sleep";
import type { ProposalPlaceOption } from "@/actions/proposals";
import type { PersonSummary } from "@/actions/users";
import { FastSleepingPlanGrid } from "@/components/proposals/FastSleepingPlanGrid";
import { useToast } from "@/components/providers/ToastProvider";
import {
  buildEmptyGridRows,
  fastSleepingRowHasContent,
  type FastSleepingRow,
} from "@/lib/proposals/fast-sleeping-plan";

function toPersonSummary(person: FastSleepGraphPerson): PersonSummary {
  return {
    id: person.id,
    username: person.username,
    displayName: person.displayName,
    role: person.role as PersonSummary["role"],
    status: person.status as PersonSummary["status"],
    avatarKey: person.avatarKey,
    profileBio: person.profileBio,
  };
}

/**
 * FastSleep create dialog — 14-night grid with per-night subject, auto-confirm (PC-380).
 */
export function FastSleepDialog({
  open,
  onClose,
  places,
  currentUserId,
}: {
  open: boolean;
  onClose: () => void;
  places: ProposalPlaceOption[];
  currentUserId: string;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [rows, setRows] = useState<FastSleepingRow[]>(() =>
    buildEmptyGridRows().map((row) => ({ ...row, subjectUserId: currentUserId })),
  );
  const [reachable, setReachable] = useState<PersonSummary[]>([]);
  const [partnersBySubjectId, setPartnersBySubjectId] = useState<
    Record<string, PersonSummary[]>
  >({});
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [pendingWarnings, setPendingWarnings] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setLoadError(null);
    setConfirming(false);
    setPendingWarnings(null);
    setRows(buildEmptyGridRows().map((row) => ({ ...row, subjectUserId: currentUserId })));
    startTransition(async () => {
      const graph = await listFastSleepGraphAction();
      if (!graph.ok) {
        setLoadError(graph.message ?? "Could not load FastSleep partners.");
        return;
      }
      setReachable(graph.reachable.map(toPersonSummary));
      const mapped: Record<string, PersonSummary[]> = {};
      for (const [subjectId, partners] of Object.entries(graph.partnersByUserId)) {
        mapped[subjectId] = partners.map(toPersonSummary);
      }
      setPartnersBySubjectId(mapped);
    });
  }, [open, currentUserId]);

  const configuredCount = useMemo(
    () => rows.filter(fastSleepingRowHasContent).length,
    [rows],
  );

  function submit(confirm: boolean) {
    setError(null);
    setPendingWarnings(null);
    startTransition(async () => {
      const result = await createFastSleepProposalAction({ rows, confirm });
      if (!result.ok) {
        if (result.warnings && result.warnings.length > 0) {
          setPendingWarnings(result.message);
          setConfirming(true);
          return;
        }
        setError(result.message);
        setConfirming(false);
        return;
      }
      showToast(result.message, "success");
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onClose={pending ? undefined : onClose}
      fullWidth
      maxWidth="md"
      data-testid="fast-sleep-dialog"
    >
      <DialogTitle>FastSleep</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Schedule up to 14 nights for yourself and your sleeping partners&apos; arrangements.
            Confirmed immediately — everyone involved is notified.
          </Typography>
          {loadError && <Alert severity="error">{loadError}</Alert>}
          {error && <Alert severity="error">{error}</Alert>}
          {pendingWarnings && (
            <Alert severity="warning">
              {pendingWarnings}
              <Typography variant="body2" sx={{ mt: 1 }}>
                Submit again to confirm despite conflicts.
              </Typography>
            </Alert>
          )}
          <FastSleepingPlanGrid
            rows={rows}
            onChange={setRows}
            partnerPeople={[]}
            locationOptions={places}
            disabled={pending || Boolean(loadError)}
            subjectPeople={reachable}
            partnersBySubjectId={partnersBySubjectId}
            defaultSubjectUserId={currentUserId}
            hideInviteeRoles
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button
          variant="contained"
          disabled={pending || configuredCount === 0 || Boolean(loadError)}
          onClick={() => submit(confirming)}
          data-testid="fast-sleep-submit"
        >
          {confirming ? "Confirm FastSleep" : `Confirm ${configuredCount || ""} night${configuredCount === 1 ? "" : "s"}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
