import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import nodemailer from 'nodemailer';

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

  // ── Fetch SMTP connection ────────────────────────────────────────────────────
  const { data: smtpConn } = await supabase
    .from('email_connections')
    .select('*')
    .eq('user_id', user.id)
    .in('provider', ['smtp', 'outlook'])
    .limit(1)
    .single();

  // ── Get signed URLs for attached documents ────────────────────────────────
  const attachments: { filename: string; path: string; contentType: string }[] = [];
  for (const doc of (documents || [])) {
    const { data: signed } = await supabase.storage
      .from('lead-attachments')
      .createSignedUrl(doc.file_path, 3600);
    if (signed?.signedUrl) {
      attachments.push({
        filename:    doc.name,
        path:        signed.signedUrl,
        contentType: doc.file_type || 'application/octet-stream',
      });
    }
  }

  // ── Send to each lender and record ────────────────────────────────────────
  const results: { lenderId: string; lenderName: string; status: string; error?: string }[] = [];

  for (const lender of lenders) {
    let status  = 'Sent';
    let errMsg: string | undefined;

    if (lender.email && smtpConn) {
      try {
        const transporter = nodemailer.createTransport({
          host:   smtpConn.smtp_host,
          port:   smtpConn.smtp_port,
          secure: smtpConn.smtp_port === 465,
          auth:   { user: smtpConn.smtp_username, pass: smtpConn.smtp_password },
        });

        await transporter.sendMail({
          from:        `${smtpConn.from_name || senderName || 'Gostwrk'} <${smtpConn.from_email || smtpConn.smtp_username}>`,
          to:          lender.email,
          cc:          lender.ccEmail || undefined,
          subject:     emailSubject,
          html:        emailBody,
          attachments,
        });
      } catch (e: unknown) {
        status = 'Failed';
        errMsg = e instanceof Error ? e.message : String(e);
        console.error(`[send-to-lenders] Failed for ${lender.name}:`, errMsg);
      }
    } else if (!lender.email) {
      // No email on file — record as "Sent" (manual submission)
      status = 'Sent';
    } else {
      // Email on file but no SMTP — record intent
      status = 'Sent';
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

  // ── Auto-trigger: if any sent successfully, advance lead status to "Submitted"
  if (sent > 0) {
    const { data: currentLead } = await supabase
      .from('leads')
      .select('lead_status, stage')
      .eq('id', leadId)
      .eq('user_id', user.id)
      .single();

    const earlyStages = new Set([
      'New Lead', 'Contacted', 'Callback Scheduled', 'Revisit', 'App Out',
      'Application Acknowledgement', 'Documents Acknowledgment',
      'Docs Requested', 'Docs In', 'Docs Received', 'Missing Docs/info',
      'Needs More Docs', 'Pre-Qualified', '',
    ]);
    const currentStatus = currentLead?.lead_status || currentLead?.stage || '';
    if (earlyStages.has(currentStatus)) {
      await supabase
        .from('leads')
        .update({ lead_status: 'Submitted' })
        .eq('id', leadId)
        .eq('user_id', user.id);
    }
  }

  return NextResponse.json({ success: true, sent, failed, results });
}
