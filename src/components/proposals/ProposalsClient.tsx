"use client";

import AddIcon from "@mui/icons-material/Add";
import {
  Alert,
  Box,
  Fab,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  deleteDraftProposalAction,
  getProposalDetailAction,
  type ProposalBoard,
  type ProposalDetail,
} from "@/actions/proposals";
import type { ProposalPlaceOption } from "@/actions/proposals";
import type { PersonSummary } from "@/actions/users";

import { ProposalCard } from "./ProposalCard";
import { ProposalDetailDialog } from "./ProposalDetailDialog";
import { ProposalDraftDialog } from "./ProposalDraftDialog";

const TAB_KEYS = ["draft", "proposed", "resolved", "archived"] as const;
type TabKey = (typeof TAB_KEYS)[number];

const TAB_LABELS: Record<TabKey, string> = {
  draft: "Drafts",
  proposed: "Proposed",
  resolved: "Resolved",
  archived: "Archived",
};

const POLY_GREEN = "#004d40";

interface ProposalsClientProps {
  board: ProposalBoard;
  people: PersonSummary[];
  places: ProposalPlaceOption[];
  currentUserId: string;
}

/**
 * Proposals hub with horizontal tabs and graphical cards (PC-40).
 */
export function ProposalsClient({
  board,
  people,
  places,
  currentUserId,
}: ProposalsClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabKey>("draft");
  const [createOpen, setCreateOpen] = useState(false);
  const [editDetail, setEditDetail] = useState<ProposalDetail | null>(null);
  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const proposals = board[activeTab];

  function openDetail(proposalId: string) {
    setSelectedProposalId(proposalId);
    setDetailOpen(true);
  }

  function handleContinueEdit(proposalId: string) {
    startTransition(async () => {
      const result = await getProposalDetailAction(proposalId);
      if (!result.ok || !result.detail) {
        setMessage(result.message);
        return;
      }
      setEditDetail(result.detail);
      setCreateOpen(true);
    });
  }

  function handleDeleteDraft(proposalId: string) {
    if (!window.confirm("Delete this draft?")) return;
    startTransition(async () => {
      const result = await deleteDraftProposalAction(proposalId);
      setMessage(result.message);
      if (result.ok) router.refresh();
    });
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
    <Box sx={{ position: "relative", pb: 10 }}>
      <Tabs
        value={activeTab}
        onChange={(_, value: TabKey) => setActiveTab(value)}
        variant="fullWidth"
        sx={{
          mb: 3,
          borderBottom: 1,
          borderColor: "divider",
          "& .MuiTab-root.Mui-selected": { color: POLY_GREEN, fontWeight: 600 },
          "& .MuiTabs-indicator": { bgcolor: POLY_GREEN },
        }}
      >
        {TAB_KEYS.map((key) => (
          <Tab
            key={key}
            value={key}
            label={`${TAB_LABELS[key]} (${board[key].length})`}
          />
        ))}
      </Tabs>

      {message && (
        <Alert severity="info" sx={{ mb: 2 }} onClose={() => setMessage(null)}>
          {message}
        </Alert>
      )}

      {proposals.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: "center" }}>
          No proposals in {TAB_LABELS[activeTab].toLowerCase()}.
        </Typography>
      ) : (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", lg: "1fr 1fr 1fr" },
            gap: 2,
          }}
        >
          {proposals.map((proposal) => (
            <ProposalCard
              key={proposal.id}
              proposal={proposal}
              onOpen={openDetail}
              onContinueEdit={proposal.state === "draft" ? handleContinueEdit : undefined}
              onDeleteDraft={proposal.state === "draft" ? handleDeleteDraft : undefined}
            />
          ))}
        </Box>
      )}

      <Fab
        color="primary"
        aria-label="New proposal"
        onClick={() => {
          setEditDetail(null);
          setCreateOpen(true);
        }}
        sx={{
          position: "fixed",
          bottom: 88,
          right: 24,
          bgcolor: POLY_GREEN,
          "&:hover": { bgcolor: "#00332c" },
        }}
      >
        <AddIcon />
      </Fab>

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
        people={people}
        onClose={() => {
          setDetailOpen(false);
          setSelectedProposalId(null);
        }}
        onEdit={handleEditFromDetail}
      />
    </Box>
  );
}
