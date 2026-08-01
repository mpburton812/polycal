/**
 * Account-persisted Feed Controls preferences (PC-264 / PC-265).
 */

export const FEED_INVOLVEMENTS = ["myself", "partners", "network"] as const;
export type FeedInvolvement = (typeof FEED_INVOLVEMENTS)[number];

export const FEED_CONTENT_KINDS = ["proposed", "votes", "resolved", "messages"] as const;
export type FeedContentKind = (typeof FEED_CONTENT_KINDS)[number];

export const FEED_PRESET_IDS = [
  "everything",
  "my_activity",
  "partners_circle",
  "milestones_only",
  "chat_only",
  "custom",
] as const;
export type FeedPresetId = (typeof FEED_PRESET_IDS)[number];

export interface FeedPrefs {
  involvement: Record<FeedInvolvement, boolean>;
  content: Record<FeedContentKind, boolean>;
  messagesInclude: { networkChat: boolean; proposalComments: boolean };
  presetId: FeedPresetId;
}

export const DEFAULT_FEED_PREFS: FeedPrefs = {
  involvement: { myself: true, partners: true, network: true },
  content: { proposed: true, votes: true, resolved: true, messages: true },
  messagesInclude: { networkChat: true, proposalComments: true },
  presetId: "everything",
};

export const FEED_PRESET_LABELS: Record<Exclude<FeedPresetId, "custom">, string> = {
  everything: "Everything",
  my_activity: "My activity",
  partners_circle: "Partners circle",
  milestones_only: "Milestones only",
  chat_only: "Chat only",
};

/**
 * Builds prefs for a named preset (PC-264).
 */
export function prefsForPreset(presetId: Exclude<FeedPresetId, "custom">): FeedPrefs {
  switch (presetId) {
    case "everything":
      return { ...DEFAULT_FEED_PREFS, presetId: "everything" };
    case "my_activity":
      return {
        involvement: { myself: true, partners: false, network: false },
        content: { proposed: true, votes: true, resolved: true, messages: true },
        messagesInclude: { networkChat: true, proposalComments: true },
        presetId: "my_activity",
      };
    case "partners_circle":
      return {
        involvement: { myself: true, partners: true, network: false },
        content: { proposed: true, votes: true, resolved: true, messages: true },
        messagesInclude: { networkChat: true, proposalComments: true },
        presetId: "partners_circle",
      };
    case "milestones_only":
      return {
        involvement: { myself: true, partners: true, network: true },
        content: { proposed: true, votes: true, resolved: true, messages: false },
        messagesInclude: { networkChat: true, proposalComments: true },
        presetId: "milestones_only",
      };
    case "chat_only":
      return {
        involvement: { myself: true, partners: true, network: true },
        content: { proposed: false, votes: false, resolved: false, messages: true },
        messagesInclude: { networkChat: true, proposalComments: true },
        presetId: "chat_only",
      };
    default: {
      const _exhaustive: never = presetId;
      return _exhaustive;
    }
  }
}

/**
 * If current prefs match a named preset, return that id; otherwise `custom`.
 */
export function detectPresetId(prefs: Omit<FeedPrefs, "presetId">): FeedPresetId {
  for (const id of FEED_PRESET_IDS) {
    if (id === "custom") continue;
    const candidate = prefsForPreset(id);
    if (
      FEED_INVOLVEMENTS.every((k) => prefs.involvement[k] === candidate.involvement[k]) &&
      FEED_CONTENT_KINDS.every((k) => prefs.content[k] === candidate.content[k]) &&
      prefs.messagesInclude.networkChat === candidate.messagesInclude.networkChat &&
      prefs.messagesInclude.proposalComments === candidate.messagesInclude.proposalComments
    ) {
      return id;
    }
  }
  return "custom";
}

/**
 * Parses stored JSON into FeedPrefs with safe defaults (PC-265).
 */
export function parseFeedPrefs(raw: string | null | undefined): FeedPrefs {
  if (!raw) return { ...DEFAULT_FEED_PREFS };

  try {
    const parsed = JSON.parse(raw) as Partial<FeedPrefs>;
    const involvement = { ...DEFAULT_FEED_PREFS.involvement };
    for (const key of FEED_INVOLVEMENTS) {
      if (typeof parsed.involvement?.[key] === "boolean") {
        involvement[key] = parsed.involvement[key];
      }
    }
    const content = { ...DEFAULT_FEED_PREFS.content };
    for (const key of FEED_CONTENT_KINDS) {
      if (typeof parsed.content?.[key] === "boolean") {
        content[key] = parsed.content[key];
      }
    }
    const messagesInclude = {
      networkChat:
        typeof parsed.messagesInclude?.networkChat === "boolean"
          ? parsed.messagesInclude.networkChat
          : DEFAULT_FEED_PREFS.messagesInclude.networkChat,
      proposalComments:
        typeof parsed.messagesInclude?.proposalComments === "boolean"
          ? parsed.messagesInclude.proposalComments
          : DEFAULT_FEED_PREFS.messagesInclude.proposalComments,
    };

    const withoutPreset = { involvement, content, messagesInclude };
    const detected = detectPresetId(withoutPreset);
    const presetId =
      parsed.presetId && FEED_PRESET_IDS.includes(parsed.presetId)
        ? parsed.presetId === "custom"
          ? detected
          : parsed.presetId
        : detected;

    return { ...withoutPreset, presetId };
  } catch {
    return { ...DEFAULT_FEED_PREFS };
  }
}
