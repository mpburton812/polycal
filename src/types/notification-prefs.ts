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

/** Legacy alert type keys before PC-65 taxonomy. */
type LegacyAlertTypes = {
  proposals?: boolean;
  partnerships?: boolean;
  events?: boolean;
  sleepingProposals?: boolean;
  eventProposals?: boolean;
  sleepingPartnerProposals?: boolean;
  reminders?: boolean;
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
 * Maps legacy `device` channel to split inApp/push booleans (PC-58).
 * When only `device` is present, both channels inherit its value.
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

/**
 * Maps legacy proposals/partnerships/events toggles to PC-65 alert categories.
 */
export function migrateAlertTypes(
  alertTypes: LegacyAlertTypes | undefined,
): NotificationPrefs["alertTypes"] {
  if (!alertTypes) return DEFAULT_NOTIFICATION_PREFS.alertTypes;

  if (
    "sleepingProposals" in alertTypes ||
    "eventProposals" in alertTypes ||
    "sleepingPartnerProposals" in alertTypes ||
    "reminders" in alertTypes
  ) {
    return {
      sleepingProposals:
        alertTypes.sleepingProposals ?? DEFAULT_NOTIFICATION_PREFS.alertTypes.sleepingProposals,
      eventProposals: alertTypes.eventProposals ?? DEFAULT_NOTIFICATION_PREFS.alertTypes.eventProposals,
      sleepingPartnerProposals:
        alertTypes.sleepingPartnerProposals ??
        DEFAULT_NOTIFICATION_PREFS.alertTypes.sleepingPartnerProposals,
      reminders: alertTypes.reminders ?? DEFAULT_NOTIFICATION_PREFS.alertTypes.reminders,
    };
  }

  const proposals = alertTypes.proposals ?? true;
  const partnerships = alertTypes.partnerships ?? true;
  const events = alertTypes.events ?? true;
  return {
    sleepingProposals: proposals,
    eventProposals: proposals,
    sleepingPartnerProposals: partnerships,
    reminders: events,
  };
}

export function parseNotificationPrefs(json: string | null | undefined): NotificationPrefs {
  if (!json) return DEFAULT_NOTIFICATION_PREFS;
  try {
    const parsed = JSON.parse(json) as Partial<NotificationPrefs> & {
      channels?: LegacyStoredChannels;
      alertTypes?: LegacyAlertTypes;
    };
    return {
      ...DEFAULT_NOTIFICATION_PREFS,
      ...parsed,
      channels: migrateNotificationChannels(parsed.channels),
      alertTypes: migrateAlertTypes(parsed.alertTypes),
    };
  } catch {
    return DEFAULT_NOTIFICATION_PREFS;
  }
}
