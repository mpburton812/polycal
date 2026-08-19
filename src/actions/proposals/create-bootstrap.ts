"use server";

import { getFastSleepEnabledAction } from "@/actions/fast-sleep";
import {
  getDraftComposerSettingsAction,
  type DraftComposerSettings,
} from "@/actions/network-settings";
import {
  listComposerPeopleRankAction,
  listProposalPlaceOptionsAction,
  listResidencyPlaceOptionsAction,
} from "@/actions/proposals/_core";
import { listPeopleAction, type PersonSummary } from "@/actions/users";
import type { PersonRankStat } from "@/lib/proposals/composer-people-rank";
import type { ProposalPlaceOption } from "./types";

export interface ProposalCreateBootstrap {
  people: PersonSummary[];
  places: ProposalPlaceOption[];
  residencyPlaces: ProposalPlaceOption[];
  fastSleepEnabled: boolean;
  composer: DraftComposerSettings;
  peopleRank: PersonRankStat[];
}

const EMPTY_BOOTSTRAP: ProposalCreateBootstrap = {
  people: [],
  places: [],
  residencyPlaces: [],
  fastSleepEnabled: true,
  composer: {
    pollEnabled: true,
    schedulingPosting: "proposals_only",
    proxySchedulingEnabled: false,
    proxySchedulingScope: "sleeping_partners",
  },
  peopleRank: [],
};

/**
 * One round-trip for FAB/composer create data (PC-449).
 * In-process helpers still auth, but the browser pays a single server-action POST.
 */
export async function getProposalCreateBootstrapAction(): Promise<ProposalCreateBootstrap> {
  try {
    const [people, places, residencyPlaces, fastSleepEnabled, composer, peopleRank] =
      await Promise.all([
        listPeopleAction(),
        listProposalPlaceOptionsAction(),
        listResidencyPlaceOptionsAction(),
        getFastSleepEnabledAction(),
        getDraftComposerSettingsAction(),
        listComposerPeopleRankAction(),
      ]);
    return { people, places, residencyPlaces, fastSleepEnabled, composer, peopleRank };
  } catch {
    return EMPTY_BOOTSTRAP;
  }
}
