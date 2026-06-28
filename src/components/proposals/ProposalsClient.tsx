"use client";

import AddIcon from "@mui/icons-material/Add";
import {
  Box,
  Fab,
  Menu,
  MenuItem,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import {
  deleteDraftProposalAction,
  getProposalDetailAction,
  type ProposalBoard,
  type ProposalCard as ProposalCardData,
  type ProposalDetail,
} from "@/actions/proposals";
import type { ProposalPlaceOption } from "@/actions/proposals";
import type { PersonSummary } from "@/actions/users";

import { ProposalCard } from "./ProposalCard";
import { PartnershipProposalDialog } from "./PartnershipProposalDialog";
import { ProposalDetailDialog } from "./ProposalDetailDialog";
import { ProposalDraftDialog } from "./ProposalDraftDialog";
import { ResidencyCreateDialog } from "./ResidencyCreateDialog";
import { SleepingPartnerCreateDialog } from "./SleepingPartnerCreateDialog";
import { PARTNERSHIP_CARD_PREFIX } from "@/lib/proposals/constants";
import { useToast } from "@/components/providers/ToastProvider";

const TAB_KEYS = ["draft", "proposed", "resolved", "archived"] as const;
type TabKey = (typeof TAB_KEYS)[number];

const TAB_LABELS: Record<TabKey, string> = {
  draft: "Drafts",
  proposed: "Proposed",
  resolved: "Resolved",
  archived: "Archived",
};

const POLY_GREEN = "#004d40";

/** Event/sleeping drafts edited via ProposalDraftDialog — not residency or group rename. */
function isStandardDraftProposal(proposal: ProposalCardData): boolean {
  if (proposal.state !== "draft") return false;
  if (proposal.specialKind === "residency" || proposal.specialKind === "group_name") {
    return false;
  }
  const kind = proposal.cardKind ?? "proposal";
  return kind === "proposal";
}

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
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabKey>("draft");
  const [createOpen, setCreateOpen] = useState(false);
  const [partnerCreateOpen, setPartnerCreateOpen] = useState(false);
  const [residencyCreateOpen, setResidencyCreateOpen] = useState(false);
  const [fabMenuAnchor, setFabMenuAnchor] = useState<null | HTMLElement>(null);
  const [editDetail, setEditDetail] = useState<ProposalDetail | null>(null);
  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [partnershipCard, setPartnershipCard] = useState<ProposalCardData | null>(null);
  const [partnershipOpen, setPartnershipOpen] = useState(false);
  const { showToast } = useToast();
  const [, startTransition] = useTransition();

  const proposals = board[activeTab];

  const allBoardCards = useMemo(
    () => [...board.draft, ...board.proposed, ...board.resolved, ...board.archived],
    [board],
  );

  function openDetail(proposalId: string) {
    if (proposalId.startsWith(PARTNERSHIP_CARD_PREFIX)) {
      const card = allBoardCards.find((row) => row.id === proposalId) ?? null;
      setPartnershipCard(card);
      setPartnershipOpen(true);
      return;
    }
    setSelectedProposalId(proposalId);
    setDetailOpen(true);
  }

  function handleContinueEdit(proposalId: string) {
    startTransition(async () => {
      const result = await getProposalDetailAction(proposalId);
      if (!result.ok || !result.detail) {
        showToast(result.message, "error");
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
      showToast(result.message, result.ok ? "success" : "error");
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

  const handledOpenRef = useRef<string | null>(null);

  useEffect(() => {
    const openId = searchParams.get("open");
    if (!openId || handledOpenRef.current === openId) return;
    handledOpenRef.current = openId;

    if (openId.startsWith(PARTNERSHIP_CARD_PREFIX)) {
      setActiveTab("proposed");
      const card = allBoardCards.find((row) => row.id === openId) ?? null;
      setPartnershipCard(card);
      setPartnershipOpen(true);
      return;
    }

    const tabForState = TAB_KEYS.find((key) => board[key].some((row) => row.id === openId));
    if (tabForState) setActiveTab(tabForState);
    setSelectedProposalId(openId);
    setDetailOpen(true);
  }, [searchParams, board, allBoardCards]);

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
              onContinueEdit={
                isStandardDraftProposal(proposal) ? handleContinueEdit : undefined
              }
              onDeleteDraft={
                isStandardDraftProposal(proposal) ? handleDeleteDraft : undefined
              }
            />
          ))}
        </Box>
      )}

      <Fab
        color="primary"
        aria-label="New proposal"
        onClick={(event) => setFabMenuAnchor(event.currentTarget)}
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

      <Menu
        anchorEl={fabMenuAnchor}
        open={Boolean(fabMenuAnchor)}
        onClose={() => setFabMenuAnchor(null)}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
        transformOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <MenuItem
          onClick={() => {
            setFabMenuAnchor(null);
            setEditDetail(null);
            setCreateOpen(true);
          }}
        >
          Event or sleeping proposal
        </MenuItem>
        <MenuItem
          onClick={() => {
            setFabMenuAnchor(null);
            setPartnerCreateOpen(true);
          }}
        >
          Sleeping partner proposal
        </MenuItem>
        <MenuItem
          onClick={() => {
            setFabMenuAnchor(null);
            setResidencyCreateOpen(true);
          }}
        >
          Place residency proposal
        </MenuItem>
      </Menu>

      <ProposalDraftDialog
        open={createOpen}
        onClose={handleDraftDialogClose}
        people={people}
        places={places}
        currentUserId={currentUserId}
        initialDetail={editDetail}
      />
      <SleepingPartnerCreateDialog
        open={partnerCreateOpen}
        onClose={() => setPartnerCreateOpen(false)}
        people={people}
        currentUserId={currentUserId}
      />
      <ResidencyCreateDialog
        open={residencyCreateOpen}
        onClose={() => setResidencyCreateOpen(false)}
        people={people}
        places={places}
        currentUserId={currentUserId}
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
      <PartnershipProposalDialog
        card={partnershipCard}
        open={partnershipOpen}
        currentUserId={currentUserId}
        onClose={() => {
          setPartnershipOpen(false);
          setPartnershipCard(null);
        }}
      />
    </Box>
  );
}
