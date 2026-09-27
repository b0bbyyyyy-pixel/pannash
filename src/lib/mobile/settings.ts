export type MobileTextSettings = {
  phoneLanding: boolean;
  webPush: boolean;
  smsFallback: boolean;
  personalAlertNumber: string;
  pushSubscription: Record<string, unknown> | null;
};

export const MOBILE_TEXT_DEFAULTS: MobileTextSettings = {
  phoneLanding: true,
  webPush: true,
  smsFallback: false,
  personalAlertNumber: '',
  pushSubscription: null,
};

export function rowToSettings(row: Record<string, unknown> | null | undefined): MobileTextSettings {
  if (!row) return { ...MOBILE_TEXT_DEFAULTS };
  return {
    phoneLanding: row.phone_landing !== false,
    webPush: row.web_push !== false,
    smsFallback: row.sms_fallback === true,
    personalAlertNumber: String(row.personal_alert_number ?? ''),
    pushSubscription: (row.push_subscription as Record<string, unknown> | null) ?? null,
  };
}

export function settingsToRow(userId: string, s: MobileTextSettings) {
  return {
    user_id: userId,
    phone_landing: s.phoneLanding,
    web_push: s.webPush,
    sms_fallback: s.smsFallback,
    personal_alert_number: s.personalAlertNumber || null,
    push_subscription: s.pushSubscription,
    updated_at: new Date().toISOString(),
  };
}
