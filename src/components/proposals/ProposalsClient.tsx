"use client";

import {
  Box,
  Tab,
  Tabs,
} from "@mui/material";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import {
  adminDeleteProposalAction,
  deleteDraftProposalAction,
  getProposalDetailAction,
  nudgePendingVotersAction,
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
import { useProposalCreate } from "@/components/proposals/ProposalCreateContext";
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

/** Event/sleeping drafts edited via ProposalDraftDialog — not residency. */
function isStandardDraftProposal(proposal: ProposalCardData): boolean {
  if (proposal.state !== "draft") return false;
  if (proposal.specialKind === "residency") {
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
  currentUserId,
  isAdmin = false,
}: ProposalsClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { openEdit } = useProposalCreate();
  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    // Survive soft-nav remounts so swipe keep-alive still restores the board tab (PC-407).
    if (typeof window === "undefined") return "draft";
    const stored = window.sessionStorage.getItem("polycal.proposals.activeTab");
    return TAB_KEYS.includes(stored as TabKey) ? (stored as TabKey) : "draft";
  });
  const [createOpen, setCreateOpen] = useState(false);
  const [editDetail, setEditDetail] = useState<ProposalDetail | null>(null);
  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [partnershipCard, setPartnershipCard] = useState<ProposalCardData | null>(null);
  const [partnershipOpen, setPartnershipOpen] = useState(false);
  const { showToast } = useToast();
  const [, startTransition] = useTransition();
  const [nudgeTargetId, setNudgeTargetId] = useState<string | null>(null);

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

  function handleNudge(proposalId: string) {
    setNudgeTargetId(proposalId);
    startTransition(async () => {
      const result = await nudgePendingVotersAction(proposalId);
      showToast(result.message, result.ok ? "success" : "error");
      setNudgeTargetId(null);
      if (result.ok) router.refresh();
    });
  }

  function handleAdminDelete(proposalId: string) {
    const card = allBoardCards.find((row) => row.id === proposalId);
    let scope: "occurrence" | "series" = "occurrence";
    if (card?.isRecurring) {
      const deleteSeries = window.confirm(
        "This is a recurring proposal.\n\nOK = delete entire series\nCancel = delete this occurrence only",
      );
      scope = deleteSeries ? "series" : "occurrence";
    }
    if (
      !window.confirm(
        `Permanently delete ${scope === "series" ? "the entire series" : "this proposal"}? All participants will be notified. This cannot be undone.`,
      )
    ) {
      return;
    }

    startTransition(async () => {
      const result = await adminDeleteProposalAction(proposalId, scope);
      showToast(result.message, result.ok ? "success" : "error");
      if (result.ok) router.refresh();
    });
  }

  function handleEditFromDetail(detail: ProposalDetail) {
    setDetailOpen(false);
    setSelectedProposalId(null);
    setActiveTab("draft");
    openEdit(detail);
  }

  function handleDraftDialogClose() {
    setCreateOpen(false);
    setEditDetail(null);
    router.refresh();
  }

  const handledOpenRef = useRef<string | null>(null);

  useEffect(() => {
    window.sessionStorage.setItem("polycal.proposals.activeTab", activeTab);
  }, [activeTab]);

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
              onNudge={proposal.canNudge ? handleNudge : undefined}
              nudgePending={nudgeTargetId === proposal.id}
              onAdminDelete={
                proposal.canAdminDeleteProposal && !proposal.id.startsWith(PARTNERSHIP_CARD_PREFIX)
                  ? handleAdminDelete
                  : undefined
              }
              onContinueEdit={
                isStandardDraftProposal(proposal) && proposal.proposerId === currentUserId
                  ? handleContinueEdit
                  : undefined
              }
              onDeleteDraft={
                isStandardDraftProposal(proposal) &&
                (proposal.proposerId === currentUserId || isAdmin)
                  ? handleDeleteDraft
                  : undefined
              }
            />
          ))}
        </Box>
      )}

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
