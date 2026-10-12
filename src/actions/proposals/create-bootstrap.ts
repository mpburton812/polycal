"use server";

import { getFastSleepEnabledAction } from "@/actions/fast-sleep";
import {
  getDraftComposerSettingsAction,
  type DraftComposerSettings,
} from "@/actions/network-settings";
import {
  listComposerPeopleRankAction,
  listProposalPlaceOptionsAction,
} from "@/actions/proposals/_core";
import { listPeopleAction, type PersonSummary } from "@/actions/users";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { DEFAULT_VIEWER_TIMEZONE, resolveTimezone } from "@/lib/schedule/timezone";
import type { PersonRankStat } from "@/lib/proposals/composer-people-rank";
import type { ProposalPlaceOption } from "./types";

export interface ProposalCreateBootstrap {
  people: PersonSummary[];
  places: ProposalPlaceOption[];
  fastSleepEnabled: boolean;
  composer: DraftComposerSettings;
  peopleRank: PersonRankStat[];
  viewerTimeZone: string;
}

const EMPTY_BOOTSTRAP: ProposalCreateBootstrap = {
  people: [],
  places: [],
  fastSleepEnabled: true,
  composer: {
    pollEnabled: true,
    schedulingPosting: "proposals_only",
    proxySchedulingEnabled: false,
    proxySchedulingScope: "sleeping_partners",
  },
  peopleRank: [],
  viewerTimeZone: "America/New_York",
};

/**
 * One round-trip for FAB/composer create data (PC-449).
 * In-process helpers still auth, but the browser pays a single server-action POST.
 */
export async function getProposalCreateBootstrapAction(): Promise<ProposalCreateBootstrap> {
  try {
    const [people, places, fastSleepEnabled, composer, peopleRank, viewerTimeZone] = await Promise.all([
      listPeopleAction(),
      listProposalPlaceOptionsAction(),
      getFastSleepEnabledAction(),
      getDraftComposerSettingsAction(),
      listComposerPeopleRankAction(),
      loadViewerTimeZone(),
    ]);
    return { people, places, fastSleepEnabled, composer, peopleRank, viewerTimeZone };
  } catch {
    return EMPTY_BOOTSTRAP;
  }
}

/** Account timezone for sleeping-night civil dates (PC-530). */
async function loadViewerTimeZone(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) return DEFAULT_VIEWER_TIMEZONE;
  const db = getDb();
  const [row] = await db
    .select({ timezone: users.timezone })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  return resolveTimezone(row?.timezone);
}
