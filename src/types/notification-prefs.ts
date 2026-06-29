export interface NotificationPrefs {
  globalEnabled: boolean;
  channels: {
    email: boolean;
    sms: boolean;
    inApp: boolean;
    push: boolean;
  };
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  alertTypes: {
    sleepingProposals: boolean;
    eventProposals: boolean;
    sleepingPartnerProposals: boolean;
    reminders: boolean;
  };
}

/** Legacy stored shape before inApp/push split (PC-58). */
type LegacyStoredChannels = {
  email?: boolean;
  sms?: boolean;
  device?: boolean;
  inApp?: boolean;
  push?: boolean;
};

/** Legacy alert toggles before PC-65 split. */
export type LegacyAlertTypes = {
  proposals?: boolean;
  partnerships?: boolean;
  events?: boolean;
};

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  globalEnabled: true,
  channels: { email: false, sms: false, inApp: true, push: false },
  quietHoursStart: null,
  quietHoursEnd: null,
  alertTypes: {
    sleepingProposals: true,
    eventProposals: true,
    sleepingPartnerProposals: true,
    reminders: true,
  },
};

/**
 * Maps legacy proposal/partnership/event toggles to PC-65 alert categories.
 */
export function migrateAlertTypes(legacy: LegacyAlertTypes): NotificationPrefs["alertTypes"] {
  const proposals = legacy.proposals ?? true;
  const partnerships = legacy.partnerships ?? true;
  const events = legacy.events ?? true;
  return {
    sleepingProposals: proposals,
    eventProposals: proposals,
    sleepingPartnerProposals: partnerships,
    reminders: events,
  };
}

/**
 * Maps legacy `device` channel to split inApp/push booleans (PC-58).
 */
export function migrateNotificationChannels(
  channels: LegacyStoredChannels | undefined,
): NotificationPrefs["channels"] {
  const email = channels?.email ?? DEFAULT_NOTIFICATION_PREFS.channels.email;
  const sms = channels?.sms ?? DEFAULT_NOTIFICATION_PREFS.channels.sms;

  if (typeof channels?.inApp === "boolean" || typeof channels?.push === "boolean") {
    return {
      email,
      sms,
      inApp: channels.inApp ?? DEFAULT_NOTIFICATION_PREFS.channels.inApp,
      push: channels.push ?? DEFAULT_NOTIFICATION_PREFS.channels.push,
    };
  }

  const device = channels?.device ?? DEFAULT_NOTIFICATION_PREFS.channels.inApp;
  return { email, sms, inApp: device, push: device };
}

function normalizeAlertTypes(
  parsed: Partial<NotificationPrefs> & { alertTypes?: LegacyAlertTypes & NotificationPrefs["alertTypes"] },
): NotificationPrefs["alertTypes"] {
  const at = parsed.alertTypes;
  if (!at) return DEFAULT_NOTIFICATION_PREFS.alertTypes;

  if (
    "sleepingProposals" in at ||
    "eventProposals" in at ||
    "sleepingPartnerProposals" in at ||
    "reminders" in at
  ) {
    return {
      sleepingProposals: at.sleepingProposals ?? DEFAULT_NOTIFICATION_PREFS.alertTypes.sleepingProposals,
      eventProposals: at.eventProposals ?? DEFAULT_NOTIFICATION_PREFS.alertTypes.eventProposals,
      sleepingPartnerProposals:
        at.sleepingPartnerProposals ?? DEFAULT_NOTIFICATION_PREFS.alertTypes.sleepingPartnerProposals,
      reminders: at.reminders ?? DEFAULT_NOTIFICATION_PREFS.alertTypes.reminders,
    };
  }

  return migrateAlertTypes(at as LegacyAlertTypes);
}

export function parseNotificationPrefs(json: string | null | undefined): NotificationPrefs {
  if (!json) return DEFAULT_NOTIFICATION_PREFS;
  try {
    const parsed = JSON.parse(json) as Partial<NotificationPrefs> & {
      channels?: LegacyStoredChannels;
      alertTypes?: LegacyAlertTypes & NotificationPrefs["alertTypes"];
    };
    return {
      ...DEFAULT_NOTIFICATION_PREFS,
      ...parsed,
      channels: migrateNotificationChannels(parsed.channels),
      alertTypes: normalizeAlertTypes(parsed),
    };
  } catch {
    return DEFAULT_NOTIFICATION_PREFS;
  }
}
