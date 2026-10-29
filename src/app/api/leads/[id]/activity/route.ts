import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { isMissedCall } from '@/lib/telephony/missed';

export const dynamic = 'force-dynamic';

export type LeadActivityEvent = {
  at: string;
  title: string;
  detail?: string;
  source: string;
};

function acts(raw: unknown): Array<Record<string, unknown>> {
  return Array.isArray(raw)
    ? raw.filter((a): a is Record<string, unknown> => !!a && typeof a === 'object')
    : [];
}

function casperEvent(run: Record<string, unknown>): LeadActivityEvent | null {
  const list = acts(run.actions);
  const at = String(run.created_at || '');
  if (!at) return null;
  const stage = run.stage ? String(run.stage) : '';
  const plan = run.plan_note ? String(run.plan_note) : '';
  const guards = Array.isArray(run.guard_results)
    ? (run.guard_results as Array<{ result?: string }>).map(g => g.result).filter(Boolean)
    : [];
  const cancelled = list.find(a => a.cancelled && a.reason);
  const rail = list.find(a => a.type === 'rail' && a.result);
  const extra = [
    stage && `Stage: ${stage}`,
    (cancelled ? `cancelled: ${cancelled.reason}` : '') || rail?.result || guards[guards.length - 1],
    plan && `Plan: ${plan}`,
  ].filter(Boolean).join(' · ');

  for (const a of list) {
    const kind = String(a.type || '');
    if (kind === 'application_sent' && a.sent !== false) {
      return {
        at,
        title: 'Application emailed',
        detail: [String(a.to || a.summary || '').trim(), extra].filter(Boolean).join(' · ') || undefined,
        source: 'casper',
      };
    }
    if (kind === 'update_lead_email' && a.updated) {
      return {
        at,
        title: 'Email updated',
        detail: [[a.old, a.next].filter(Boolean).join(' → '), extra].filter(Boolean).join(' · ') || undefined,
        source: 'casper',
      };
    }
  }
  if (cancelled || extra) {
    return {
      at,
      title: cancelled ? 'Casper draft cancelled' : 'Casper run',
      detail: extra || undefined,
      source: 'casper',
    };
  }
  return null;
}

const CALL_STATUS: Record<string, string> = {
  dry_run: 'Dry run',
  created: 'Started',
  ringing_agent: 'Ringing',
  agent_answered: 'Dialing',
  in_progress: 'On call',
  completed: '',
  no_answer: 'No answer',
  busy: 'Busy',
  failed: 'Failed',
  canceled: 'Canceled',
  agent_no_answer: 'Desk missed',
};

function callDuration(seconds: unknown): string {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s <= 0) return '';
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

function callEvent(row: Record<string, unknown>): LeadActivityEvent | null {
  const at = String(row.started_at || '');
  if (!at) return null;
  const status = String(row.status || '');
  if (status === 'dry_run') return null;
  const inbound = String(row.direction || '') === 'inbound';
  const missed = isMissedCall({
    status,
    direction: inbound ? 'inbound' : String(row.direction || 'outbound'),
    answered_at: row.answered_at ? String(row.answered_at) : null,
  });
  const title = inbound ? (missed ? 'Missed call' : 'Call received') : 'Call made';
  const detail = [
    CALL_STATUS[status] ?? (status && status !== 'completed' ? status.replace(/_/g, ' ') : ''),
    callDuration(row.duration_seconds),
    row.disposition ? String(row.disposition).replace(/_/g, ' ') : '',
    String(row.notes || '').trim(),
  ].filter(Boolean).join(' · ');
  return { at, title, detail: detail || undefined, source: 'call' };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: leadId } = await params;
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } },
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: lead } = await supabase
    .from('leads')
    .select('id, created_at, underwriting_data')
    .eq('id', leadId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const events: LeadActivityEvent[] = [];
  if (lead.created_at) {
    events.push({ at: lead.created_at, title: 'Lead created', source: 'lead' });
  }

  const ud = (lead.underwriting_data || {}) as Record<string, unknown>;
  if (Array.isArray(ud.statusHistory)) {
    for (const row of ud.statusHistory) {
      if (!row || typeof row !== 'object') continue;
      const r = row as { at?: string; status?: string; prev?: string };
      if (!r.at || !r.status) continue;
      events.push({
        at: r.at,
        title: 'Status updated',
        detail: r.prev ? `${r.prev} → ${r.status}` : r.status,
        source: 'status',
      });
    }
  }
  if (ud.fundedAt) {
    events.push({ at: String(ud.fundedAt), title: 'Marked funded', source: 'status' });
  }
  if (Array.isArray(ud.fileEvents)) {
    for (const row of ud.fileEvents) {
      if (!row || typeof row !== 'object') continue;
      const r = row as { at?: string; title?: string; detail?: string };
      if (!r.at || !r.title) continue;
      events.push({
        at: r.at,
        title: r.title,
        detail: r.detail,
        source: /email|application/i.test(r.title) ? 'casper' : 'lead',
      });
    }
  }

  const [{ data: files }, { data: runs }, { data: history }, { data: submissions }, callsRes] = await Promise.all([
    supabase
      .from('lead_attachments')
      .select('file_name, column_field, created_at')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
      .limit(80),
    (async () => {
      const full = await supabase
        .from('casper_runs')
        .select('actions, created_at, stage, plan_note, guard_results')
        .eq('user_id', user.id)
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })
        .limit(80);
      if (full.error && /stage|plan_note|guard_results|schema cache|42703|PGRST/i.test(`${full.error.message || ''} ${full.error.code || ''}`)) {
        return supabase
          .from('casper_runs')
          .select('actions, created_at')
          .eq('user_id', user.id)
          .eq('lead_id', leadId)
          .order('created_at', { ascending: false })
          .limit(80);
      }
      return full;
    })(),
    supabase
      .from('contact_history')
      .select('notes, contact_date')
      .eq('user_id', user.id)
      .eq('lead_id', leadId)
      .order('contact_date', { ascending: false })
      .limit(40),
    supabase
      .from('lender_submissions')
      .select('lender_name, status, created_at')
      .eq('user_id', user.id)
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
      .limit(40),
    (async () => {
      const full = await supabase
        .from('dialer_calls')
        .select('direction, status, disposition, notes, started_at, duration_seconds, answered_at')
        .eq('lead_id', leadId)
        .eq('agent_id', user.id)
        .order('started_at', { ascending: false })
        .limit(80);
      if (full.error && /direction|answered_at|duration_seconds|schema cache|42703|PGRST/i.test(`${full.error.message || ''} ${full.error.code || ''}`)) {
        return supabase
          .from('dialer_calls')
          .select('status, disposition, notes, started_at, duration_seconds')
          .eq('lead_id', leadId)
          .eq('agent_id', user.id)
          .order('started_at', { ascending: false })
          .limit(80);
      }
      return full;
    })(),
  ]);

  for (const file of files ?? []) {
    const name = String(file.file_name || 'Document');
    const bucket = String(file.column_field || '').replace(/_/g, ' ');
    events.push({
      at: file.created_at,
      title: 'Document uploaded',
      detail: bucket ? `${name} · ${bucket}` : name,
      source: 'docs',
    });
  }

  for (const run of runs ?? []) {
    const ev = casperEvent(run as Record<string, unknown>);
    if (ev) events.push(ev);
  }

  for (const row of history ?? []) {
    const notes = String(row.notes || '').trim();
    if (!notes || !row.contact_date) continue;
    const emailed = /application/i.test(notes);
    const emailUpdated = /email updated|updated email/i.test(notes);
    if (!emailed && !emailUpdated) continue;
    events.push({
      at: row.contact_date,
      title: emailed ? 'Application emailed' : 'Email updated',
      detail: notes,
      source: 'contact',
    });
  }

  for (const call of callsRes.data ?? []) {
    const ev = callEvent(call as Record<string, unknown>);
    if (ev) events.push(ev);
  }

  for (const sub of submissions ?? []) {
    const lender = String(sub.lender_name || 'lender').trim();
    events.push({
      at: sub.created_at,
      title: 'Submitted to lenders',
      detail: sub.status ? `${lender} · ${sub.status}` : lender,
      source: 'lenders',
    });
  }

  events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  return NextResponse.json({ events: events.slice(0, 80) });
}
