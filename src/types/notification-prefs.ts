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
    proposals: boolean;
    partnerships: boolean;
    events: boolean;
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

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  globalEnabled: true,
  channels: { email: false, sms: false, inApp: true, push: false },
  quietHoursStart: null,
  quietHoursEnd: null,
  alertTypes: { proposals: true, partnerships: true, events: true },
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

export function parseNotificationPrefs(json: string | null | undefined): NotificationPrefs {
  if (!json) return DEFAULT_NOTIFICATION_PREFS;
  try {
    const parsed = JSON.parse(json) as Partial<NotificationPrefs> & {
      channels?: LegacyStoredChannels;
    };
    return {
      ...DEFAULT_NOTIFICATION_PREFS,
      ...parsed,
      channels: migrateNotificationChannels(parsed.channels),
      alertTypes: { ...DEFAULT_NOTIFICATION_PREFS.alertTypes, ...parsed.alertTypes },
    };
  } catch {
    return DEFAULT_NOTIFICATION_PREFS;
  }
}
