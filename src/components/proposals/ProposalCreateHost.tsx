"use client";

import AddIcon from "@mui/icons-material/Add";
import { Fab, Menu, MenuItem } from "@mui/material";
import dynamic from "next/dynamic";
import { useCallback, useMemo, useState } from "react";

import { getFastSleepEnabledAction } from "@/actions/fast-sleep";
import {
  getDraftComposerSettingsAction,
  type DraftComposerSettings,
} from "@/actions/network-settings";
import {
  listComposerPeopleRankAction,
  listProposalPlaceOptionsAction,
  listResidencyPlaceOptionsAction,
  type ProposalDetail,
  type ProposalPlaceOption,
} from "@/actions/proposals";
import { listPeopleAction, type PersonSummary } from "@/actions/users";
import type { PersonRankStat } from "@/lib/proposals/composer-people-rank";
import {
  ProposalCreateContext,
  type ProposalCreateRequest,
} from "@/components/proposals/ProposalCreateContext";
import { GARDEN_TOKENS } from "@/theme/tokens";

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
 * `currentUserId` comes from the server layout — client `useSession()` can still be empty
 * when the FAB opens, which would submit residency/FastSleep as an invalid blank user.
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

  const loadCreateData = useCallback(async () => {
    const [nextPeople, nextPlaces, nextResidency, nextFastSleep, nextComposer, nextRank] =
      await Promise.all([
        listPeopleAction(),
        listProposalPlaceOptionsAction(),
        listResidencyPlaceOptionsAction(),
        getFastSleepEnabledAction(),
        getDraftComposerSettingsAction(),
        listComposerPeopleRankAction(),
      ]);
    setPeople(nextPeople);
    setPlaces(nextPlaces);
    setResidencyPlaces(nextResidency);
    setFastSleepEnabled(nextFastSleep);
    setComposerSettings(nextComposer);
    setPeopleRank(nextRank);
  }, []);

  const openCreate = useCallback(
    (request?: ProposalCreateRequest) => {
      void loadCreateData().then(() => {
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

  const contextValue = useMemo(() => ({ openCreate }), [openCreate]);

  async function handleFabClick(event: React.MouseEvent<HTMLElement>) {
    const anchor = event.currentTarget;
    await loadCreateData();
    setFabMenuAnchor(anchor);
  }

  return (
    <ProposalCreateContext.Provider value={contextValue}>
      {children}
      <Fab
        color="primary"
        aria-label="New proposal"
        onClick={(event) => void handleFabClick(event)}
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
            setEditDetail(null);
            setCreateProposalType("event");
            setLockCreateType(false);
            setCreateInitialStartAt(null);
            setComposerMode("manual");
            setCreateOpen(true);
          }}
        >
          New Event
        </MenuItem>
        <MenuItem
          onClick={() => {
            setFabMenuAnchor(null);
            setEditDetail(null);
            setCreateProposalType("event");
            setLockCreateType(false);
            setCreateInitialStartAt(null);
            setComposerMode("nlp");
            setCreateOpen(true);
          }}
        >
          New Event (NLP Input)
        </MenuItem>
        {fastSleepEnabled ? (
          <MenuItem
            onClick={() => {
              setFabMenuAnchor(null);
              setFastSleepOpen(true);
            }}
            data-testid="fab-fast-sleep"
          >
            Bulk Sleep Booking
          </MenuItem>
        ) : null}
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
          Residency Proposal
        </MenuItem>
      </Menu>
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
      <SleepingPartnerCreateDialog
        open={partnerCreateOpen}
        onClose={() => setPartnerCreateOpen(false)}
        people={people}
        currentUserId={currentUserId}
      />
      <FastSleepDialog
        open={fastSleepOpen}
        onClose={() => setFastSleepOpen(false)}
        places={places}
        currentUserId={currentUserId}
      />
      <ResidencyCreateDialog
        open={residencyCreateOpen}
        onClose={() => setResidencyCreateOpen(false)}
        people={people}
        places={residencyPlaces.length > 0 ? residencyPlaces : places}
        currentUserId={currentUserId}
      />
    </ProposalCreateContext.Provider>
  );
}
