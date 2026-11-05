import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { logLeadStatusChange } from '@/lib/leads/fileActivity';
import {
  LENDER_SUBMISSION_FROM,
  pickConnectionByEmail,
  type SendConnection,
} from '@/lib/email/sendAccounts';
import { sendOutboundMail, type OutboundAttachment } from '@/lib/email/sendOutbound';
import { wrapLetterHtml } from '@/lib/email/letterHtml';
import { fillLeadPlaceholders } from '@/lib/email/fillLeadPlaceholders';

export const runtime  = 'nodejs';
export const dynamic  = 'force-dynamic';
export const maxDuration = 60;

// ── Types ─────────────────────────────────────────────────────────────────────
interface SelectedLender {
  id: string;
  name: string;
  email?: string | null;
  ccEmail?: string | null;
}

interface SelectedDoc {
  id: string;
  name: string;
  file_path: string;
  file_type: string;
}

// ── Main handler ──────────────────────────────────────────────────────────────
export async function POST(request: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const {
    leadId,
    lenders,           // SelectedLender[]
    documents,         // SelectedDoc[]
    templateId,
    templateName,
    note,
    senderName,
  }: {
    leadId: string;
    lenders: SelectedLender[];
    documents: SelectedDoc[];
    templateId?: string;
    templateName?: string;
    note?: string;
    senderName?: string;
  } = await request.json();

  if (!leadId || !lenders?.length) {
    return NextResponse.json({ error: 'leadId and at least one lender required' }, { status: 400 });
  }

  // ── Fetch email template body ─────────────────────────────────────────────
  let emailSubject = 'Business Funding Application';
  let emailBody    = '<p>Please find the attached funding application for your review.</p>';

  if (templateId) {
    const { data: tpl } = await supabase
      .from('email_templates')
      .select('subject, body')
      .eq('id', templateId)
      .eq('user_id', user.id)
      .single();
    if (tpl) {
      emailSubject = tpl.subject || emailSubject;
      emailBody    = tpl.body    || emailBody;
    }
  }
  if (note) emailBody += `<br/><br/><em>Note: ${note}</em>`;

  const { data: lead } = await supabase
    .from('leads')
    .select('name, email, phone, company, underwriting_data')
    .eq('id', leadId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (lead) {
    emailSubject = fillLeadPlaceholders(emailSubject, lead);
    emailBody = fillLeadPlaceholders(emailBody, lead);
  }
  emailBody = wrapLetterHtml(emailBody);

  const { data: connections } = await supabase
    .from('email_connections')
    .select('*')
    .eq('user_id', user.id);

  const fromConn = pickConnectionByEmail(
    connections as SendConnection[] | null,
    LENDER_SUBMISSION_FROM,
  );
  if (!fromConn) {
    return NextResponse.json(
      { error: `Connect ${LENDER_SUBMISSION_FROM} in Settings → Connections, then send again.` },
      { status: 400 },
    );
  }

  const { data: settings } = await supabase
    .from('user_settings')
    .select('email_from_name')
    .eq('user_id', user.id)
    .maybeSingle();

  const attachments: OutboundAttachment[] = [];
  for (const doc of (documents || [])) {
    const { data: blob, error: dlErr } = await supabase.storage
      .from('lead-attachments')
      .download(doc.file_path);
    if (dlErr || !blob) {
      console.error(`[send-to-lenders] Could not download ${doc.name}:`, dlErr?.message);
      continue;
    }
    attachments.push({
      filename:    doc.name,
      content:     Buffer.from(await blob.arrayBuffer()),
      contentType: doc.file_type || 'application/octet-stream',
    });
  }

  // ── Send to each lender and record ────────────────────────────────────────
  const results: { lenderId: string; lenderName: string; status: string; error?: string }[] = [];

  for (const lender of lenders) {
    let status  = 'Sent';
    let errMsg: string | undefined;

    if (!lender.email) {
      status = 'Sent';
    } else {
      const sent = await sendOutboundMail(supabase, {
        userId: user.id,
        connection: fromConn,
        to: lender.email,
        cc: lender.ccEmail,
        subject: emailSubject,
        html: emailBody,
        attachments,
        settingsFromName: settings?.email_from_name,
        extraName: senderName,
      });
      if (!sent.sent) {
        status = 'Failed';
        errMsg = sent.error;
        console.error(`[send-to-lenders] Failed for ${lender.name}:`, errMsg);
      }
    }

    // ── Insert submission record ────────────────────────────────────────────
    await supabase.from('lender_submissions').insert({
      user_id:             user.id,
      lead_id:             leadId,
      lender_id:           lender.id,
      lender_name:         lender.name,
      lender_email:        lender.email || null,
      status,
      documents_sent:      documents.map(d => ({ id: d.id, name: d.name })),
      sent_by_name:        senderName || null,
      note:                note || null,
      email_template_name: templateName || null,
    });

    results.push({ lenderId: lender.id, lenderName: lender.name, status, error: errMsg });
  }

  const sent   = results.filter(r => r.status === 'Sent').length;
  const failed = results.filter(r => r.status === 'Failed').length;

  // ── Auto-trigger: if any sent successfully, always advance status to "Submitted"
  if (sent > 0) {
    await logLeadStatusChange(supabase, { userId: user.id, leadId, status: 'Submitted' });
    await supabase
      .from('leads')
      .update({ lead_status: 'Submitted' })
      .eq('id', leadId)
      .eq('user_id', user.id);
  }

  return NextResponse.json({ success: true, sent, failed, results });
}
