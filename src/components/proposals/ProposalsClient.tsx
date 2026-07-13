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
import { PARTNERSHIP_CARD_PREFIX } from "@/lib/proposals/constants";
import { useToast } from "@/components/providers/ToastProvider";
import { EmptyState, type EmptyStateIllustration } from "@/components/ui/EmptyState";
import { GARDEN_TOKENS } from "@/theme/tokens";
import dynamic from "next/dynamic";

/** Heavy dialogs load on demand so the proposals board paints sooner (PC-145). */
const ProposalDetailDialog = dynamic(
  () =>
    import("./ProposalDetailDialog").then((mod) => ({ default: mod.ProposalDetailDialog })),
  { ssr: false },
);
const ProposalDraftDialog = dynamic(
  () =>
    import("./ProposalDraftDialog").then((mod) => ({ default: mod.ProposalDraftDialog })),
  { ssr: false },
);
const ResidencyCreateDialog = dynamic(
  () =>
    import("./ResidencyCreateDialog").then((mod) => ({ default: mod.ResidencyCreateDialog })),
  { ssr: false },
);
const SleepingPartnerCreateDialog = dynamic(
  () =>
    import("./SleepingPartnerCreateDialog").then((mod) => ({
      default: mod.SleepingPartnerCreateDialog,
    })),
  { ssr: false },
);

const TAB_KEYS = ["draft", "proposed", "resolved", "archived"] as const;
type TabKey = (typeof TAB_KEYS)[number];

const TAB_LABELS: Record<TabKey, string> = {
  draft: "Drafts",
  proposed: "Proposed",
  resolved: "Resolved",
  archived: "Archived",
};

const TAB_EMPTY: Record<
  TabKey,
  { title: string; description: string; illustration?: EmptyStateIllustration }
> = {
  draft: {
    title: "No drafts yet",
    description: "Start a proposal when inspiration strikes.",
  },
  proposed: {
    title: "Nothing in flight",
    description: "Proposed plans waiting for votes will show up here.",
  },
  resolved: {
    title: "Nothing resolved yet",
    description: "Approved plans land here once everyone agrees.",
  },
  archived: {
    title: "Nothing archived yet",
    description: "Your resolved plans will live here for safekeeping.",
    illustration: "proposals-archived",
  },
};

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
  /** All places with member names for residency self-join (PC-190). */
  residencyPlaces?: ProposalPlaceOption[];
  currentUserId: string;
  /** App admin — enables oversight chrome on others' cards (PC-196). */
  isAdmin?: boolean;
}

/**
 * Proposals hub with horizontal tabs and graphical cards (PC-40).
 */
export function ProposalsClient({
  board,
  people,
  places,
  residencyPlaces,
  currentUserId,
  isAdmin = false,
}: ProposalsClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabKey>("draft");
  const [createOpen, setCreateOpen] = useState(false);
  const [createProposalType, setCreateProposalType] = useState<"event" | "sleeping">("event");
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
          borderBottom: `2px solid ${GARDEN_TOKENS.ink}`,
          "& .MuiTab-root": {
            fontFamily: "var(--font-space-grotesk), sans-serif",
            fontWeight: 600,
          },
          "& .MuiTab-root.Mui-selected": { color: GARDEN_TOKENS.sage },
          "& .MuiTabs-indicator": {
            bgcolor: GARDEN_TOKENS.sage,
            height: 3,
          },
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
        <EmptyState
          illustration={TAB_EMPTY[activeTab].illustration}
          title={TAB_EMPTY[activeTab].title}
          description={TAB_EMPTY[activeTab].description}
          data-testid={`proposals-empty-${activeTab}`}
        />
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
              isAdmin={isAdmin}
              currentUserId={currentUserId}
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
          bgcolor: GARDEN_TOKENS.sage,
          color: GARDEN_TOKENS.surface,
          border: `3px solid ${GARDEN_TOKENS.ink}`,
          boxShadow: "none",
          "&:hover": {
            bgcolor: "#557A5C",
            boxShadow: "none",
          },
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
            setCreateProposalType("event");
            setCreateOpen(true);
          }}
        >
          Event proposal
        </MenuItem>
        <MenuItem
          onClick={() => {
            setFabMenuAnchor(null);
            setEditDetail(null);
            setCreateProposalType("sleeping");
            setCreateOpen(true);
          }}
        >
          Sleeping proposal
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
        lockedProposalType={editDetail ? undefined : createProposalType}
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
        places={residencyPlaces ?? places}
        currentUserId={currentUserId}
      />
      <ProposalDetailDialog
        proposalId={selectedProposalId}
        open={detailOpen}
        people={people}
        isAdmin={isAdmin}
        currentUserId={currentUserId}
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
