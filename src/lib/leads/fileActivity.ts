type Ud = Record<string, unknown>;

const ACTIVITY_KEYS = ['statusHistory', 'fileEvents'] as const;

function asUd(raw: unknown): Ud {
  return raw && typeof raw === 'object' ? { ...(raw as Ud) } : {};
}

/** Keep Updates history when a form save overwrites underwriting_data. */
export function preserveFileActivity(incoming: Ud, existing: unknown): Ud {
  const prev = asUd(existing);
  const next = { ...incoming };
  for (const key of ACTIVITY_KEYS) {
    if (next[key] == null && prev[key] != null) next[key] = prev[key];
  }
  return next;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function writeUd(supabase: any, userId: string, leadId: string, ud: Ud) {
  await supabase
    .from('leads')
    .update({ underwriting_data: ud })
    .eq('id', leadId)
    .eq('user_id', userId);
}

/** Record a status change on the lead file (shown in Status → Updates). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function appendStatusHistory(
  supabase: any,
  args: { userId: string; leadId: string; status: string; prev?: string | null; underwritingData?: unknown },
): Promise<Ud> {
  const ud = asUd(args.underwritingData);
  const history = Array.isArray(ud.statusHistory) ? [...ud.statusHistory] : [];
  const prev = String(args.prev || '').trim();
  const status = String(args.status || '').trim();
  if (status && prev !== status) {
    history.push({ at: new Date().toISOString(), status, prev: prev || null });
  }
  if (status === 'Funded') {
    ud.isFunded = true;
    ud.fundedAt = ud.fundedAt || new Date().toISOString();
  }
  ud.statusHistory = history.slice(-80);
  await writeUd(supabase, args.userId, args.leadId, ud);
  return ud;
}

/** Fetch current status, log the change, then return the previous row. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function logLeadStatusChange(
  supabase: any,
  args: { userId: string; leadId: string; status: string },
): Promise<void> {
  try {
    const { data } = await supabase
      .from('leads')
      .select('lead_status, underwriting_data')
      .eq('id', args.leadId)
      .eq('user_id', args.userId)
      .maybeSingle();
    if (!data) return;
    await appendStatusHistory(supabase, {
      userId: args.userId,
      leadId: args.leadId,
      status: args.status,
      prev: data.lead_status,
      underwritingData: data.underwriting_data,
    });
  } catch (err) {
    console.warn('[fileActivity] status log failed', err);
  }
}

/** Record a sent email on the lead file (shown in Status → Updates). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function appendEmailSent(
  supabase: any,
  args: { userId: string; leadId: string; to?: string; subject?: string; at?: string },
): Promise<void> {
  try {
    const { data } = await supabase
      .from('leads')
      .select('underwriting_data')
      .eq('id', args.leadId)
      .eq('user_id', args.userId)
      .maybeSingle();
    const ud = asUd(data?.underwriting_data);
    const events = Array.isArray(ud.fileEvents) ? [...ud.fileEvents] : [];
    const subject = String(args.subject || '').trim();
    const application = /application/i.test(subject);
    const title = application ? 'Application emailed' : 'Email sent';
    const detail = [subject, args.to].filter(Boolean).join(' · ');
    const already = events.some(e => {
      if (!e || typeof e !== 'object') return false;
      const row = e as { title?: string; detail?: string };
      return row.title === title && row.detail === detail;
    });
    if (already) return;
    events.push({
      at: args.at && !Number.isNaN(Date.parse(args.at)) ? args.at : new Date().toISOString(),
      title,
      detail,
    });
    ud.fileEvents = events.slice(-80);
    await writeUd(supabase, args.userId, args.leadId, ud);
  } catch (err) {
    console.warn('[fileActivity] email log failed', err);
  }
}
