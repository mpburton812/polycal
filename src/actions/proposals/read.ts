"use server";

/**
 * Re-exports proposal board/listing actions split from the main proposals module (PC-59).
 */
export {
  listProposalBoardAction,
  listAcceptedSleepingPartnerIdsAction,
  listSleepingLocationOptionsAction,
  listProposalPlaceOptionsAction,
} from "../proposals";
