import nodemailer from 'nodemailer';
import { applicationFileName, buildFundingApplication } from '@/lib/fundingApplication';
import { buildFundingApplicationPdf } from '@/lib/fundingApplicationPdf';

export type EmailAppResult = {
  sent: boolean;
  error?: string;
  fileName?: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function emailApplicationToLead(
  supabase: any,
  args: { userId: string; lead: Record<string, unknown> },
): Promise<EmailAppResult> {
  const email = String(args.lead.email ?? '').trim();
  if (!email || !email.includes('@')) {
    return { sent: false, error: 'Lead has no email' };
  }

  const { data, missing } = buildFundingApplication(args.lead);
  if (missing.length) {
    return { sent: false, error: `Missing application fields: ${missing.join(', ')}` };
  }

  const { data: smtpConn } = await supabase
    .from('email_connections')
    .select('*')
    .eq('user_id', args.userId)
    .in('provider', ['smtp', 'outlook'])
    .limit(1)
    .maybeSingle();

  if (!smtpConn?.smtp_host) {
    return { sent: false, error: 'No email connection' };
  }

  const pdf = await buildFundingApplicationPdf(data);
  const fileName = applicationFileName(String(args.lead.company || args.lead.name || 'Application'));

  const transporter = nodemailer.createTransport({
    host: smtpConn.smtp_host,
    port: smtpConn.smtp_port,
    secure: smtpConn.smtp_port === 465,
    auth: { user: smtpConn.smtp_username, pass: smtpConn.smtp_password },
  });

  const company = String(args.lead.company || args.lead.name || 'your business');
  await transporter.sendMail({
    from: `${smtpConn.from_name || 'One Funding'} <${smtpConn.from_email || smtpConn.smtp_username}>`,
    to: email,
    subject: 'Funding application — One Funding',
    html: `<p>Hi,</p><p>Attached is the funding application for ${company}. Please complete it and send it back along with the last 3–6 months of business bank statements.</p><p>Robert Gulinello<br/>One Funding</p>`,
    attachments: [{ filename: fileName, content: Buffer.from(pdf), contentType: 'application/pdf' }],
  });

  return { sent: true, fileName };
}
