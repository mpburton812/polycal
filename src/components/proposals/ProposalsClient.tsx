"use client";

import {
  Alert,
  Box,
  Button,
  Chip,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { type ProposalBoard, type ProposalCard, type ProposalDetail } from "@/actions/proposals";
import type { ProposalPlaceOption } from "@/actions/proposals";
import type { PersonSummary } from "@/actions/users";

import { ProposalDetailDialog } from "./ProposalDetailDialog";
import { ProposalDraftDialog } from "./ProposalDraftDialog";

const COLUMN_LABELS = {
  draft: "Drafts",
  proposed: "Proposed",
  resolved: "Resolved",
  archived: "Archived",
} as const;

interface ProposalsClientProps {
  board: ProposalBoard;
  people: PersonSummary[];
  places: ProposalPlaceOption[];
  currentUserId: string;
}

function ProposalListItem({
  proposal,
  onOpen,
}: {
  proposal: ProposalCard;
  onOpen: (id: string) => void;
}) {
  return (
    <ListItem disableGutters sx={{ borderBottom: 1, borderColor: "divider" }}>
      <ListItemButton onClick={() => onOpen(proposal.id)} sx={{ alignItems: "flex-start", py: 1.5 }}>
        <ListItemText
          primary={
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
              <Typography variant="subtitle2">{proposal.title}</Typography>
              <Chip size="small" label={proposal.proposalType} variant="outlined" />
              {proposal.atRisk && <Chip size="small" label="At risk" color="warning" />}
              {proposal.needsViewerAction && (
                <Chip size="small" label="Action needed" color="primary" />
              )}
            </Stack>
          }
          secondary={
            <>
              {proposal.description}
              <br />
              Proposer: {proposal.proposerName}
              {proposal.locationName ? ` · ${proposal.locationName}` : ""}
              {proposal.inviteeCount > 0 ? ` · ${proposal.inviteeCount} invitee(s)` : ""}
            </>
          }
        />
      </ListItemButton>
    </ListItem>
  );
}

/**
 * Interactive proposals Kanban — Phase 4 voting and draft editing (PC-40).
 */
export function ProposalsClient({
  board,
  people,
  places,
  currentUserId,
}: ProposalsClientProps) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editDetail, setEditDetail] = useState<ProposalDetail | null>(null);
  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function openDetail(proposalId: string) {
    setSelectedProposalId(proposalId);
    setDetailOpen(true);
  }

  function handleEditFromDetail(detail: ProposalDetail) {
    setDetailOpen(false);
    setEditDetail(detail);
    setCreateOpen(true);
  }

  function handleDraftDialogClose() {
    setCreateOpen(false);
    setEditDetail(null);
    router.refresh();
  }

  return (
    <Box>
      <Stack direction="row" justifyContent="flex-end" sx={{ mb: 2 }}>
        <Button
          variant="contained"
          onClick={() => {
            setEditDetail(null);
            setCreateOpen(true);
          }}
        >
          New proposal
        </Button>
      </Stack>
      {message && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {message}
        </Alert>
      )}
      <Stack spacing={2}>
        {(Object.keys(COLUMN_LABELS) as (keyof ProposalBoard)[]).map((column) => (
          <Paper key={column} variant="outlined" sx={{ p: 2 }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
              <Typography variant="subtitle1" fontWeight={600}>
                {COLUMN_LABELS[column]}
              </Typography>
              <Chip size="small" label={board[column].length} />
            </Stack>
            {board[column].length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No proposals in this column.
              </Typography>
            ) : (
              <List dense disablePadding>
                {board[column].map((proposal) => (
                  <ProposalListItem
                    key={proposal.id}
                    proposal={proposal}
                    onOpen={openDetail}
                  />
                ))}
              </List>
            )}
          </Paper>
        ))}
      </Stack>
      <ProposalDraftDialog
        open={createOpen}
        onClose={handleDraftDialogClose}
        people={people}
        places={places}
        currentUserId={currentUserId}
        initialDetail={editDetail}
      />
      <ProposalDetailDialog
        proposalId={selectedProposalId}
        open={detailOpen}
        onClose={() => {
          setDetailOpen(false);
          setSelectedProposalId(null);
        }}
        onEdit={handleEditFromDetail}
      />
    </Box>
  );
}
