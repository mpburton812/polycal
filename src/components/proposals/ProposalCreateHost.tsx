"use client";

import AddIcon from "@mui/icons-material/Add";
import { Fab, Menu, MenuItem } from "@mui/material";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  getProposalCreateBootstrapAction,
  type ProposalDetail,
  type ProposalPlaceOption,
} from "@/actions/proposals";
import type { DraftComposerSettings } from "@/actions/network-settings";
import type { PersonSummary } from "@/actions/users";
import type { PersonRankStat } from "@/lib/proposals/composer-people-rank";
import {
  ProposalCreateContext,
  type ProposalCreateRequest,
} from "@/components/proposals/ProposalCreateContext";
import { GARDEN_TOKENS } from "@/theme/tokens";

const BOOTSTRAP_TTL_MS = 60_000;

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
const FastSleepDialog = dynamic(
  () =>
    import("./FastSleepDialog").then((mod) => ({
      default: mod.FastSleepDialog,
    })),
  { ssr: false },
);

/**
 * Shared sage + create host mounted in AppShell so every screen has the full menu (PC-418).
 * Menu opens immediately; composer lists load in one bootstrap action (PC-449).
 */
export function ProposalCreateHost({
  children,
  currentUserId,
}: {
  children: React.ReactNode;
  currentUserId: string;
}) {
  const [fabMenuAnchor, setFabMenuAnchor] = useState<null | HTMLElement>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createProposalType, setCreateProposalType] = useState<"event" | "sleeping">("event");
  const [lockCreateType, setLockCreateType] = useState(false);
  const [createInitialStartAt, setCreateInitialStartAt] = useState<string | null>(null);
  const [partnerCreateOpen, setPartnerCreateOpen] = useState(false);
  const [fastSleepOpen, setFastSleepOpen] = useState(false);
  const [residencyCreateOpen, setResidencyCreateOpen] = useState(false);
  const [people, setPeople] = useState<PersonSummary[]>([]);
  const [places, setPlaces] = useState<ProposalPlaceOption[]>([]);
  const [residencyPlaces, setResidencyPlaces] = useState<ProposalPlaceOption[]>([]);
  const [fastSleepEnabled, setFastSleepEnabled] = useState(true);
  const [composerSettings, setComposerSettings] = useState<DraftComposerSettings | null>(null);
  const [peopleRank, setPeopleRank] = useState<PersonRankStat[]>([]);
  const [editDetail, setEditDetail] = useState<ProposalDetail | null>(null);
  const [composerMode, setComposerMode] = useState<"manual" | "nlp">("manual");
  const loadedAtRef = useRef(0);
  const pathname = usePathname();
  const hideFab = pathname === "/feed" || pathname === "/people-places";

  /**
   * Prefetch may use the TTL cache; opening a composer always force-refreshes.
   * Otherwise a settings change (e.g. Proposals and Bookings) stays stale for 60s.
   */
  const loadCreateData = useCallback(async (force = false) => {
    if (!force && loadedAtRef.current && Date.now() - loadedAtRef.current < BOOTSTRAP_TTL_MS) {
      return;
    }
    const next = await getProposalCreateBootstrapAction();
    setPeople(next.people);
    setPlaces(next.places);
    setResidencyPlaces(next.residencyPlaces);
    setFastSleepEnabled(next.fastSleepEnabled);
    setComposerSettings(next.composer);
    setPeopleRank(next.peopleRank);
    loadedAtRef.current = Date.now();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadCreateData();
    }, 800);
    return () => window.clearTimeout(timer);
  }, [loadCreateData]);

  const openCreate = useCallback(
    (request?: ProposalCreateRequest) => {
      void loadCreateData(true).then(() => {
        setEditDetail(null);
        if (request?.lockedType) {
          setCreateProposalType(request.lockedType);
          setLockCreateType(true);
          setCreateInitialStartAt(request.initialStartAt ?? null);
          setComposerMode("manual");
          setCreateOpen(true);
          return;
        }
        setCreateInitialStartAt(null);
      });
    },
    [loadCreateData],
  );

  const openEdit = useCallback(
    (detail: ProposalDetail) => {
      void loadCreateData(true).then(() => {
        setEditDetail(detail);
        setLockCreateType(false);
        setCreateInitialStartAt(null);
        setComposerMode("manual");
        setCreateOpen(true);
      });
    },
    [loadCreateData],
  );

  const contextValue = useMemo(() => ({ openCreate, openEdit }), [openCreate, openEdit]);

  function handleFabClick(event: React.MouseEvent<HTMLElement>) {
    setFabMenuAnchor(event.currentTarget);
    void loadCreateData();
  }

  return (
    <ProposalCreateContext.Provider value={contextValue}>
      {children}
      {hideFab ? null : (
        <>
      <Fab
        color="primary"
        aria-label="New proposal"
        onClick={handleFabClick}
        onMouseEnter={() => void loadCreateData()}
        sx={{
          position: "fixed",
          bottom: 88,
          right: 24,
          zIndex: 1200,
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
            void loadCreateData(true).then(() => {
              setEditDetail(null);
              setCreateProposalType("event");
              setLockCreateType(false);
              setCreateInitialStartAt(null);
              setComposerMode("manual");
              setCreateOpen(true);
            });
          }}
        >
          New Event
        </MenuItem>
        <MenuItem
          onClick={() => {
            setFabMenuAnchor(null);
            void loadCreateData(true).then(() => {
              setEditDetail(null);
              setCreateProposalType("event");
              setLockCreateType(false);
              setCreateInitialStartAt(null);
              setComposerMode("nlp");
              setCreateOpen(true);
            });
          }}
        >
          New Event (NLP Input)
        </MenuItem>
        {fastSleepEnabled ? (
          <MenuItem
            onClick={() => {
              setFabMenuAnchor(null);
              void loadCreateData(true).then(() => setFastSleepOpen(true));
            }}
            data-testid="fab-fast-sleep"
          >
            Bulk Sleep Booking
          </MenuItem>
        ) : null}
        <MenuItem
          onClick={() => {
            setFabMenuAnchor(null);
            void loadCreateData(true).then(() => setPartnerCreateOpen(true));
          }}
        >
          Sleeping partner proposal
        </MenuItem>
        <MenuItem
          onClick={() => {
            setFabMenuAnchor(null);
            void loadCreateData(true).then(() => setResidencyCreateOpen(true));
          }}
        >
          Residency Proposal
        </MenuItem>
      </Menu>
        </>
      )}
      {createOpen ? (
      <ProposalDraftDialog
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          setCreateInitialStartAt(null);
          setEditDetail(null);
        }}
        people={people}
        places={places}
        currentUserId={currentUserId}
        initialDetail={editDetail}
        lockedProposalType={editDetail ? undefined : lockCreateType ? createProposalType : undefined}
        initialStartAt={createInitialStartAt}
        composerSettings={composerSettings ?? undefined}
        peopleRank={peopleRank}
        composerMode={editDetail ? "manual" : composerMode}
      />
      ) : null}
      {partnerCreateOpen ? (
      <SleepingPartnerCreateDialog
        open={partnerCreateOpen}
        onClose={() => setPartnerCreateOpen(false)}
        people={people}
        currentUserId={currentUserId}
      />
      ) : null}
      {fastSleepOpen ? (
      <FastSleepDialog
        open={fastSleepOpen}
        onClose={() => setFastSleepOpen(false)}
        places={places}
        currentUserId={currentUserId}
      />
      ) : null}
      {residencyCreateOpen ? (
      <ResidencyCreateDialog
        open={residencyCreateOpen}
        onClose={() => setResidencyCreateOpen(false)}
        people={people}
        places={residencyPlaces.length > 0 ? residencyPlaces : places}
        currentUserId={currentUserId}
      />
      ) : null}
    </ProposalCreateContext.Provider>
  );
}
