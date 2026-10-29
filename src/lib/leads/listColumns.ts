/** Column lists for rails / boards — never pull bankStatementAnalysis JSON. */

export const INBOX_LEAD_COLS =
  'id, name, company, phone, email, value, stage, month_key, last_contact, created_at, in_pipeline, lead_status, list_id, sms_opt_out, casper_enabled, sms_language, email_from_sms:underwriting_data->>email_from_sms';
export const INBOX_LEAD_COLS_NO_LANG =
  'id, name, company, phone, email, value, stage, month_key, last_contact, created_at, in_pipeline, lead_status, list_id, sms_opt_out, casper_enabled, email_from_sms:underwriting_data->>email_from_sms';
export const INBOX_LEAD_COLS_NO_ALIAS =
  'id, name, company, phone, email, value, stage, month_key, last_contact, created_at, in_pipeline, lead_status, list_id, sms_opt_out, casper_enabled';
export const INBOX_LEAD_COLS_MIN =
  'id, name, company, phone, email, value, stage, month_key, last_contact, created_at, in_pipeline, lead_status, list_id';

export const INBOX_SIBLING_COLS =
  'id, name, company, phone, email, in_pipeline, lead_status, last_contact, sms_opt_out, casper_enabled, list_id';

export const CONV_COLS =
  'id, lead_id, last_message_at, last_inbound_at, last_direction, last_message_preview, unread_count';
export const CONV_COLS_MIN =
  'id, lead_id, last_message_at, last_direction, last_message_preview, unread_count';

export const MSG_COLS =
  'id, conversation_id, lead_id, direction, body, status, sent_by, twilio_sid, error_message, created_at, media_items, body_en, body_original, detected_lang';
export const MSG_COLS_NO_LANG =
  'id, conversation_id, lead_id, direction, body, status, sent_by, twilio_sid, error_message, created_at, media_items';
export const MSG_COLS_MIN =
  'id, conversation_id, lead_id, direction, body, status, sent_by, twilio_sid, error_message, created_at';

const PIPELINE_UD_KEYS = [
  'requestedAmount', 'commission', 'commissionPaid', 'isFunded', 'fundedAt', 'followUpDate',
  'adjustedAmount', 'approvedAmount', 'selectedOfferId', 'actualOffers',
  'businessAddress', 'businessCity', 'businessState', 'businessZip', 'businessPhone',
  'businessEmail', 'ein', 'businessStartDate', 'entityType', 'isSoleProp', 'industry',
  'purposeOfFunds', 'monthlyRevenue', 'month1Revenue', 'month2Revenue', 'month3Revenue',
  'month4Revenue', 'homeAddress', 'city', 'state', 'zip', 'ssn', 'dob',
  'ownershipPercent', 'ownerTitle', 'creditScore', 'dba',
] as const;

const PIPELINE_UD_SELECT = PIPELINE_UD_KEYS.map(k => `ud_${k}:underwriting_data->${k}`).join(',');

export const PIPELINE_LEAD_COLS = [
  'id, name, email, phone, company, notes, last_contact, last_called_at, updated_at, created_at',
  'lead_status, in_pipeline, month_key, stage, value, list_id, sms_opt_out',
  'follow_up_at, follow_up_due_at, follow_up_auto_text, follow_up_sms_body',
  'timer_type, timer_end_date, assigned_to, temperature',
  PIPELINE_UD_SELECT,
].join(', ');

export const PIPELINE_LEAD_COLS_CORE = [
  'id, name, email, phone, company, notes, last_contact, created_at',
  'lead_status, in_pipeline, month_key, stage, value, list_id, sms_opt_out',
  PIPELINE_UD_SELECT,
].join(', ');

export const CAMPAIGN_LEAD_COLS =
  'id, name, email, phone, company, notes, sms_sent_at, call_made_at, last_contact, created_at, ud_businessCity:underwriting_data->businessCity, ud_businessState:underwriting_data->businessState, ud_city:underwriting_data->city, ud_state:underwriting_data->state';
export const CAMPAIGN_LEAD_COLS_MIN =
  'id, name, email, phone, company, notes, sms_sent_at, call_made_at, last_contact, created_at';

export const FUNDED_LIST_COLS =
  'lead_status, ud_isFunded:underwriting_data->isFunded, ud_fundedAt:underwriting_data->fundedAt, ud_lastUpdated:underwriting_data->lastUpdated, ud_adjustedAmount:underwriting_data->adjustedAmount, ud_requestedAmount:underwriting_data->requestedAmount, ud_commission:underwriting_data->commission, ud_selectedOfferId:underwriting_data->selectedOfferId, ud_actualOffers:underwriting_data->actualOffers';

export const TZ_LEAD_COLS =
  'id, name, company, phone, sms_opt_out, in_pipeline, lead_status, ud_businessState:underwriting_data->>businessState, ud_state:underwriting_data->>state, ud_businessCity:underwriting_data->>businessCity, ud_city:underwriting_data->>city';

function takeUd(row: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const ud: Record<string, unknown> = {};
  for (const k of keys) {
    const alias = `ud_${k}`;
    if (row[alias] != null && row[alias] !== '') ud[k] = row[alias];
    delete row[alias];
  }
  return ud;
}

export function hydrateListUd(row: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!row) return {};
  const ud = takeUd(row, PIPELINE_UD_KEYS);
  if (Object.keys(ud).length) row.underwriting_data = ud;
  return row;
}

export function hydrateCampaignUd(row: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!row) return {};
  const ud = takeUd(row, ['businessCity', 'businessState', 'city', 'state']);
  if (Object.keys(ud).length) row.underwriting_data = ud;
  return row;
}

export function hydrateFundedUd(row: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!row) return {};
  return takeUd(row, [
    'isFunded', 'fundedAt', 'lastUpdated', 'adjustedAmount', 'requestedAmount',
    'commission', 'selectedOfferId', 'actualOffers',
  ]);
}

export function hydrateTzUd(row: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!row) return {};
  const ud = takeUd(row, ['businessState', 'state', 'businessCity', 'city']);
  if (Object.keys(ud).length) row.underwriting_data = ud;
  return row;
}

export function emailFromSmsFlag(row: Record<string, unknown>): boolean {
  const v = row.email_from_sms;
  return v === true || v === 'true' || v === 't';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function selectFirst<T = any>(
  attempts: Array<() => PromiseLike<{ data: T | null; error: { message?: string } | null }>>,
): Promise<{ data: T | null; error: { message?: string } | null }> {
  let last: { data: T | null; error: { message?: string } | null } = { data: null, error: { message: 'no attempts' } };
  for (const run of attempts) {
    last = await run();
    if (!last.error) return last;
  }
  return last;
}
