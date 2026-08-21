export * from "./enums";
export * from "./identity";
export * from "./networks";
export * from "./places";
export * from "./proposals";
export * from "./notifications";
export * from "./feed";
export * from "./calendar";
export * from "./admin";
export * from "./infra";

import { alphaFeedbackSubmissions, motdAcknowledgments, motdMessages, platformLogAcknowledgments, platformSystemLog } from "./admin";
import { calendarConnections, calendarEventLinks, calendarIcsPending } from "./calendar";
import {
  feedImageUploads,
  feedLikes,
  feedLinkPreviews,
  networkChatCommentImages,
  networkChatComments,
  networkChatMessageImages,
  networkChatMessages,
  storedImages,
} from "./feed";
import { schemaMeta, rateLimitBuckets } from "./infra";
import { users } from "./identity";
import {
  networkMembers,
  networkSetupTokens,
  networks,
  platformSettings,
} from "./networks";
import {
  notificationDismissals,
  pushSubscriptions,
  userActivityLog,
} from "./notifications";
import { locationResidents, locations, sleepingPartnerships } from "./places";
import {
  proposalCommentImages,
  proposalComments,
  proposalInvitees,
  proposalSlotVotes,
  proposalStateLog,
  proposalTimeSlots,
  proposals,
} from "./proposals";

export const schema = {
  users,
  networks,
  networkMembers,
  networkSetupTokens,
  platformSettings,
  motdMessages,
  motdAcknowledgments,
  platformSystemLog,
  platformLogAcknowledgments,
  locations,
  userActivityLog,
  storedImages,
  alphaFeedbackSubmissions,
  schemaMeta,
  rateLimitBuckets,
  proposals,
  proposalInvitees,
  proposalSlotVotes,
  proposalTimeSlots,
  proposalStateLog,
  proposalComments,
  notificationDismissals,
  pushSubscriptions,
  sleepingPartnerships,
  locationResidents,
  networkChatMessages,
  networkChatComments,
  networkChatMessageImages,
  networkChatCommentImages,
  proposalCommentImages,
  feedImageUploads,
  feedLikes,
  feedLinkPreviews,
  calendarConnections,
  calendarEventLinks,
  calendarIcsPending,
};
