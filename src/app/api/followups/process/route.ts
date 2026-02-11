import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { google } from 'googleapis';
import nodemailer from 'nodemailer';
import { Resend } from 'resend';
import { addEmailTracking, convertToHtml } from '@/lib/email-tracking';

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Process and send scheduled follow-ups
 * Similar to queue processor but for follow-ups
 */
export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set() {},
          remove() {},
        },
      }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch scheduled follow-ups that are ready to send
    const now = new Date().toISOString();
    const { data: followUps, error: followUpsError } = await supabase
      .from('follow_ups')
      .select(`
        *,
        campaigns(user_id),
        leads(name, company, email, phone)
      `)
      .eq('campaigns.user_id', user.id)
      .eq('status', 'scheduled')
      .lte('scheduled_for', now)
      .limit(5); // Process 5 follow-ups at a time

    if (followUpsError) {
      console.error('Follow-ups fetch error:', followUpsError);
      return NextResponse.json({ error: followUpsError.message }, { status: 500 });
    }

    if (!followUps || followUps.length === 0) {
      return NextResponse.json({ 
        message: 'No follow-ups to send', 
        processed: 0 
      });
    }

    // Get user's email connections
    const { data: connections } = await supabase
      .from('email_connections')
      .select('*')
      .eq('user_id', user.id);

    const gmailConnection = connections?.find((c) => c.provider === 'gmail');
    const outlookConnection = connections?.find((c) => c.provider === 'outlook');

    let successCount = 0;
    let failCount = 0;

    for (const followUp of followUps) {
      try {
        const lead = followUp.leads as any;
        
        // Add tracking
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
        const trackedBody = addEmailTracking(followUp.body, followUp.campaign_lead_id, baseUrl);
        const htmlBody = convertToHtml(trackedBody);

        let success = false;
        let errorMessage = '';

        // Try Gmail first
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
              `Subject: ${followUp.subject}`,
              `Content-Type: text/html; charset=utf-8`,
              ``,
              htmlBody,
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
            console.log(`[Follow-up] Sent via Gmail to ${lead.email}`);
          } catch (err: any) {
            console.error('Gmail send error:', err);
            errorMessage = err.message;
          }
        }

        // Try Outlook SMTP if Gmail failed
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
              subject: followUp.subject,
              html: htmlBody,
            });

            success = true;
            console.log(`[Follow-up] Sent via Outlook to ${lead.email}`);
          } catch (err: any) {
            console.error('Outlook send error:', err);
            errorMessage = err.message;
          }
        }

        // Fallback to Resend
        if (!success) {
          try {
            await resend.emails.send({
              from: 'Pannash <onboarding@resend.dev>',
              to: lead.email,
              subject: followUp.subject,
              html: htmlBody,
            });

            success = true;
            console.log(`[Follow-up] Sent via Resend to ${lead.email}`);
          } catch (err: any) {
            console.error('Resend send error:', err);
            errorMessage = err.message;
          }
        }

        // Update follow-up status
        if (success) {
          await supabase
            .from('follow_ups')
            .update({ 
              status: 'sent', 
              sent_at: new Date().toISOString() 
            })
            .eq('id', followUp.id);

          successCount++;
        } else {
          await supabase
            .from('follow_ups')
            .update({ 
              status: 'failed',
              error_message: errorMessage 
            })
            .eq('id', followUp.id);

          failCount++;
        }
      } catch (err: any) {
        console.error(`Error processing follow-up ${followUp.id}:`, err);
        failCount++;
      }
    }

    return NextResponse.json({
      message: `Processed ${followUps.length} follow-ups: ${successCount} sent, ${failCount} failed`,
      processed: followUps.length,
      success: successCount,
      failed: failCount,
    });
  } catch (err: any) {
    console.error('Follow-up processing error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
