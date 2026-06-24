"use client";

import {
  Alert,
  Box,
  Button,
  Chip,
  List,
  ListItem,
  ListItemText,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  submitProposalAction,
  type ProposalBoard,
  type ProposalCard,
} from "@/actions/proposals";
import type { ProposalPlaceOption } from "@/actions/proposals";
import type { PersonSummary } from "@/actions/users";

import { CreateProposalDialog } from "./CreateProposalDialog";

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
  showSubmit,
  onSubmit,
  pending,
}: {
  proposal: ProposalCard;
  showSubmit: boolean;
  onSubmit: (id: string) => void;
  pending: boolean;
}) {
  return (
    <ListItem
      disableGutters
      sx={{
        alignItems: "flex-start",
        flexDirection: "column",
        borderBottom: 1,
        borderColor: "divider",
        py: 1.5,
      }}
    >
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
        <Typography variant="subtitle2">{proposal.title}</Typography>
        <Chip size="small" label={proposal.proposalType} variant="outlined" />
        {proposal.atRisk && <Chip size="small" label="At risk" color="warning" />}
        {proposal.needsViewerAction && (
          <Chip size="small" label="Action needed" color="primary" />
        )}
      </Stack>
      <ListItemText
        primaryTypographyProps={{ variant: "body2" }}
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
      {showSubmit && (
        <Button
          size="small"
          variant="outlined"
          sx={{ mt: 1 }}
          disabled={pending}
          onClick={() => onSubmit(proposal.id)}
        >
          Submit proposal
        </Button>
      )}
    </ListItem>
  );
}

/**
 * Interactive proposals Kanban — Phase 4 foundation (PC-40).
 */
export function ProposalsClient({
  board,
  people,
  places,
  currentUserId,
}: ProposalsClientProps) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(proposalId: string) {
    setMessage(null);
    startTransition(async () => {
      const result = await submitProposalAction(proposalId);
      setMessage(result.message);
      if (result.ok) router.refresh();
    });
  }

  return (
    <Box>
      <Stack direction="row" justifyContent="flex-end" sx={{ mb: 2 }}>
        <Button variant="contained" onClick={() => setCreateOpen(true)}>
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
                    showSubmit={column === "draft" && proposal.proposerId === currentUserId}
                    onSubmit={handleSubmit}
                    pending={pending}
                  />
                ))}
              </List>
            )}
          </Paper>
        ))}
      </Stack>
      <CreateProposalDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        people={people}
        places={places}
        currentUserId={currentUserId}
      />
    </Box>
  );
}
