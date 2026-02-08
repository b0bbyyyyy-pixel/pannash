import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { google } from 'googleapis';
import nodemailer from 'nodemailer';
import { Resend } from 'resend';
import { replaceTemplateVariables } from '@/lib/queue';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name) {
            return cookieStore.get(name)?.value;
          },
          set(name, value, options) {
            cookieStore.set({ name, value, ...options });
          },
          remove(name, options) {
            cookieStore.set({ name, value: '', ...options });
          },
        },
      }
    );

    // Get current user (for auth)
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch pending emails that are ready to send (scheduled_for <= now)
    const now = new Date().toISOString();
    const { data: queueItems, error: queueError } = await supabase
      .from('email_queue')
      .select(`
        *,
        campaigns(user_id, subject, email_body),
        leads(name, company, email, phone, notes)
      `)
      .eq('status', 'pending')
      .lte('scheduled_for', now)
      .limit(10); // Process 10 at a time

    if (queueError) {
      console.error('Queue fetch error:', queueError);
      return NextResponse.json({ error: queueError.message }, { status: 500 });
    }

    if (!queueItems || queueItems.length === 0) {
      return NextResponse.json({ message: 'No emails to send', processed: 0 });
    }

    let successCount = 0;
    let failureCount = 0;

    // Process each email
    for (const item of queueItems) {
      try {
        // Check user owns this campaign
        if ((item.campaigns as any).user_id !== user.id) {
          continue; // Skip if not owner
        }

        // Mark as sending
        await supabase
          .from('email_queue')
          .update({ status: 'sending', updated_at: new Date().toISOString() })
          .eq('id', item.id);

        // Get user's email connections
        const { data: connections } = await supabase
          .from('email_connections')
          .select('*')
          .eq('user_id', user.id);

        const gmailConnection = connections?.find((c) => c.provider === 'gmail');
        const outlookConnection = connections?.find((c) => c.provider === 'outlook');

        // Prepare email content
        const lead = item.leads as any;
        const campaign = item.campaigns as any;
        
        const subject = replaceTemplateVariables(campaign.subject, lead);
        const body = replaceTemplateVariables(campaign.email_body, lead);

        let success = false;
        let errorMessage = '';

        // Try sending via Gmail OAuth
        if (gmailConnection) {
          try {
            const oauth2Client = new google.auth.OAuth2(
              process.env.GOOGLE_CLIENT_ID!,
              process.env.GOOGLE_CLIENT_SECRET!,
              `${process.env.NEXT_PUBLIC_BASE_URL}/api/auth/google/callback`
            );

            oauth2Client.setCredentials({
              access_token: gmailConnection.access_token,
              refresh_token: gmailConnection.refresh_token,
              expiry_date: gmailConnection.expiry_date
                ? new Date(gmailConnection.expiry_date).getTime()
                : undefined,
            });

            const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

            const message = [
              `To: ${lead.email}`,
              `Subject: ${subject}`,
              ``,
              body,
            ].join('\n');

            const encodedMessage = Buffer.from(message)
              .toString('base64')
              .replace(/\+/g, '-')
              .replace(/\//g, '_')
              .replace(/=+$/, '');

            await gmail.users.messages.send({
              userId: 'me',
              requestBody: {
                raw: encodedMessage,
              },
            });

            success = true;
            console.log(`Sent via Gmail to ${lead.email}`);
          } catch (err: any) {
            console.error('Gmail send error:', err);
            errorMessage = err.message;
          }
        }

        // Try Outlook SMTP if Gmail failed or not configured
        if (!success && outlookConnection) {
          try {
            const transporter = nodemailer.createTransport({
              host: outlookConnection.smtp_host,
              port: outlookConnection.smtp_port,
              secure: outlookConnection.smtp_port === 465,
              auth: {
                user: outlookConnection.smtp_username,
                pass: outlookConnection.smtp_password,
              },
            });

            await transporter.sendMail({
              from: `${outlookConnection.from_name || 'Pannash'} <${outlookConnection.from_email}>`,
              to: lead.email,
              subject: subject,
              text: body,
            });

            success = true;
            console.log(`Sent via Outlook SMTP to ${lead.email}`);
          } catch (err: any) {
            console.error('Outlook send error:', err);
            errorMessage = err.message;
          }
        }

        // Fallback to Resend if both failed
        if (!success) {
          try {
            await resend.emails.send({
              from: 'Pannash <onboarding@resend.dev>',
              to: lead.email,
              subject: subject,
              text: body,
            });

            success = true;
            console.log(`Sent via Resend to ${lead.email}`);
          } catch (err: any) {
            console.error('Resend send error:', err);
            errorMessage = err.message;
          }
        }

        // Update queue and campaign_leads status
        if (success) {
          await supabase
            .from('email_queue')
            .update({ status: 'sent', updated_at: new Date().toISOString() })
            .eq('id', item.id);

          await supabase
            .from('campaign_leads')
            .update({
              status: 'sent',
              sent_at: new Date().toISOString(),
            })
            .eq('campaign_id', item.campaign_id)
            .eq('lead_id', item.lead_id);

          successCount++;
        } else {
          // Mark as failed
          await supabase
            .from('email_queue')
            .update({
              status: 'failed',
              last_error: errorMessage,
              attempts: item.attempts + 1,
              updated_at: new Date().toISOString(),
            })
            .eq('id', item.id);

          await supabase
            .from('campaign_leads')
            .update({
              status: 'failed',
              error_message: errorMessage,
            })
            .eq('campaign_id', item.campaign_id)
            .eq('lead_id', item.lead_id);

          failureCount++;
        }
      } catch (err: any) {
        console.error('Error processing queue item:', err);
        failureCount++;
      }
    }

    return NextResponse.json({
      message: 'Queue processed',
      processed: successCount + failureCount,
      success: successCount,
      failed: failureCount,
    });
  } catch (err: any) {
    console.error('Queue processor error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
