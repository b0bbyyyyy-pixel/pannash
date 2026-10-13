import { fillLeadPlaceholders } from '@/lib/email/fillLeadPlaceholders';
import { sendLeadEmail } from '@/lib/email/sendLeadEmail';

const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const LOOKS_LIKE_EMAIL = /@|\b[\w.+-]+\s+at\s+[\w.-]+\s*dot\s*\w+/i;

export type ExtractedEmail = { email?: string; invalid: boolean };

export function extractEmailFromSms(raw: string): ExtractedEmail {
  const text = String(raw || '');
  const matches = text.match(EMAIL_RE) ?? [];
  const cleaned = matches.map(m => m.trim().toLowerCase().replace(/[.,;:!?)]+$/g, ''));
  const valid = cleaned.find(isValidEmail);
  if (valid) return { email: valid, invalid: false };
  if (LOOKS_LIKE_EMAIL.test(text) || cleaned.length > 0) return { invalid: true };
  return { invalid: false };
}

export function isValidEmail(value: string): boolean {
  const email = value.trim().toLowerCase();
  if (email.length < 6 || email.length > 254) return false;
  if (email.includes('..') || email.startsWith('.') || email.endsWith('.')) return false;
  const m = email.match(/^([a-z0-9._%+\-]+)@([a-z0-9.\-]+)\.([a-z]{2,})$/);
  if (!m) return false;
  if (!m[1] || !m[2] || m[2].startsWith('-') || m[2].endsWith('-')) return false;
  return true;
}

export type UpdateLeadEmailResult = {
  updated: boolean;
  invalid: boolean;
  old?: string | null;
  next?: string;
  sentApplication?: boolean;
  actions: Record<string, unknown>[];
  needsHuman?: boolean;
  humanReason?: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function runUpdateLeadEmailTool(
  supabase: any,
  args: {
    userId: string;
    lead: {
      id: string;
      email?: string | null;
      notes?: string | null;
      name?: string | null;
      phone?: string | null;
      company?: string | null;
    };
    body: string;
    sendApplication: boolean;
  },
): Promise<UpdateLeadEmailResult> {
  const found = extractEmailFromSms(args.body);
  const actions: Record<string, unknown>[] = [];

  if (found.invalid) {
    actions.push({
      type: 'update_lead_email',
      updated: false,
      invalid: true,
      summary: 'Email updated: invalid address — NEEDS YOU',
    });
    return {
      updated: false,
      invalid: true,
      needsHuman: true,
      humanReason: 'Lead sent an email that looks invalid. Casper did not save it.',
      actions,
    };
  }

  if (!found.email) {
    return { updated: false, invalid: false, actions };
  }

  const old = (args.lead.email || '').trim() || null;
  const next = found.email;
  const sameEmail = (old || '').toLowerCase() === next;

  if (!sameEmail) {
    const line = `[Casper] Email updated: ${old || '(none)'} → ${next}`;
    const notes = args.lead.notes?.trim()
      ? `${args.lead.notes.trim()}\n${line}`
      : line;

    const { error } = await supabase
      .from('leads')
      .update({ email: next, notes })
      .eq('id', args.lead.id)
      .eq('user_id', args.userId);

    if (error) {
      actions.push({ type: 'update_lead_email', updated: false, error: error.message });
      return { updated: false, invalid: false, actions };
    }

    args.lead.email = next;
    args.lead.notes = notes;

    try {
      await supabase.from('contact_history').insert({
        user_id: args.userId,
        lead_id: args.lead.id,
        contact_date: new Date().toISOString(),
        notes: line,
      });
    } catch {
      /* table may be missing */
    }

    actions.push({
      type: 'update_lead_email',
      updated: true,
      old,
      next,
      summary: `Email updated: ${old || '(none)'} -> ${next}`,
    });
  }

  if (!args.sendApplication) {
    return { updated: !sameEmail, invalid: false, old, next, sentApplication: false, actions };
  }

  if (sameEmail && await applicationAlreadySent(supabase, args.userId, args.lead.id, args.lead.notes)) {
    return { updated: false, invalid: false, old, next, sentApplication: false, actions };
  }

  const sent = await sendApplicationTemplate(supabase, {
    userId: args.userId,
    lead: { ...args.lead, email: next },
  });
  actions.push(...sent.actions);
  if (sent.sent) {
    await markApplicationSent(supabase, args.userId, args.lead);
  }
  return {
    updated: !sameEmail,
    invalid: false,
    old,
    next,
    sentApplication: sent.sent,
    actions,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function sendApplicationTemplate(
  supabase: any,
  args: {
    userId: string;
    lead: {
      id: string;
      email?: string | null;
      name?: string | null;
      phone?: string | null;
      company?: string | null;
    };
  },
): Promise<{ sent: boolean; actions: Record<string, unknown>[] }> {
  const { data: templates } = await supabase
    .from('email_templates')
    .select('id, name, subject, body')
    .eq('user_id', args.userId);

  const tpl = (templates ?? []).find(
    (t: { name?: string }) => String(t.name || '').trim().toUpperCase() === 'APPLICATION',
  );
  if (!tpl) {
    return {
      sent: false,
      actions: [{ type: 'application_sent', sent: false, error: 'APPLICATION template not found' }],
    };
  }

  const { data: full } = await supabase
    .from('leads')
    .select('id, name, email, phone, company, underwriting_data')
    .eq('id', args.lead.id)
    .maybeSingle();

  const lead = {
    name: full?.name || args.lead.name,
    email: args.lead.email || full?.email,
    phone: full?.phone || args.lead.phone,
    company: full?.company || args.lead.company,
    underwriting_data: (full?.underwriting_data || null) as Record<string, unknown> | null,
  };

  const subject = fillLeadPlaceholders(String(tpl.subject || 'Application'), lead);
  const html = fillLeadPlaceholders(String(tpl.body || ''), lead);
  try {
    const result = await sendLeadEmail(supabase, {
      userId: args.userId,
      leadId: args.lead.id,
      to: String(lead.email || ''),
      subject,
      html,
    });

    if (result.sent) {
      return { sent: true, actions: [{ type: 'application_sent', sent: true, summary: 'APPLICATION sent', to: result.to }] };
    }
    return {
      sent: false,
      actions: [{ type: 'application_sent', sent: false, error: result.error || 'Send failed' }],
    };
  } catch (err) {
    return {
      sent: false,
      actions: [{
        type: 'application_sent',
        sent: false,
        error: err instanceof Error ? err.message : 'Send failed',
      }],
    };
  }
}

const APPLICATION_SENT_MARK = '[Casper] APPLICATION sent';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function applicationAlreadySent(
  supabase: any,
  userId: string,
  leadId: string,
  notes?: string | null,
): Promise<boolean> {
  if (notes && notes.includes(APPLICATION_SENT_MARK)) return true;
  try {
    const { data: runs } = await supabase
      .from('casper_runs')
      .select('actions')
      .eq('user_id', userId)
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
      .limit(40);
    for (const run of runs ?? []) {
      const acts = Array.isArray(run.actions) ? run.actions : [];
      if (acts.some((a: { type?: string; sent?: boolean }) => a?.type === 'application_sent' && a.sent === true)) {
        return true;
      }
    }
  } catch {
    /* ignore */
  }
  return false;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function markApplicationSent(
  supabase: any,
  userId: string,
  lead: { id: string; notes?: string | null },
) {
  if (lead.notes?.includes(APPLICATION_SENT_MARK)) return;
  const notes = lead.notes?.trim()
    ? `${lead.notes.trim()}\n${APPLICATION_SENT_MARK}`
    : APPLICATION_SENT_MARK;
  try {
    await supabase
      .from('leads')
      .update({ notes })
      .eq('id', lead.id)
      .eq('user_id', userId);
    lead.notes = notes;
  } catch {
    /* ignore */
  }
}
