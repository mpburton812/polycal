export interface NotificationPrefs {
  globalEnabled: boolean;
  channels: {
    email: boolean;
    sms: boolean;
    device: boolean;
  };
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  alertTypes: {
    proposals: boolean;
    partnerships: boolean;
    events: boolean;
  };
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  globalEnabled: true,
  channels: { email: false, sms: false, device: true },
  quietHoursStart: null,
  quietHoursEnd: null,
  alertTypes: { proposals: true, partnerships: true, events: true },
};

export function parseNotificationPrefs(json: string | null | undefined): NotificationPrefs {
  if (!json) return DEFAULT_NOTIFICATION_PREFS;
  try {
    const parsed = JSON.parse(json) as Partial<NotificationPrefs>;
    return {
      ...DEFAULT_NOTIFICATION_PREFS,
      ...parsed,
      channels: { ...DEFAULT_NOTIFICATION_PREFS.channels, ...parsed.channels },
      alertTypes: { ...DEFAULT_NOTIFICATION_PREFS.alertTypes, ...parsed.alertTypes },
    };
  } catch {
    return DEFAULT_NOTIFICATION_PREFS;
  }
}
