import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { google } from 'googleapis';
import nodemailer from 'nodemailer';
import { Resend } from 'resend';
import { replaceTemplateVariables } from '@/lib/queue';
import { addEmailTracking, convertToHtml, generateTrackingId } from '@/lib/email-tracking';
import { refreshGmailToken, isTokenExpired } from '@/lib/gmail-refresh';

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
    // ONLY for active campaigns
    const now = new Date().toISOString();
    const { data: queueItems, error: queueError } = await supabase
      .from('email_queue')
      .select(`
        *,
        campaigns!inner(user_id, subject, email_body, status)
      `)
      .eq('status', 'pending')
      .eq('campaigns.status', 'active')
      .lte('scheduled_for', now)
      .limit(10); // Process 10 at a time
    
    // Fetch lead data separately to avoid RLS issues
    let enrichedQueueItems: any[] = [];
    if (queueItems && queueItems.length > 0) {
      const leadIds = queueItems.map(item => item.lead_id);
      const { data: leadsData } = await supabase
        .from('leads')
        .select('id, name, company, email, phone, notes')
        .in('id', leadIds);
      
      enrichedQueueItems = queueItems.map(item => ({
        ...item,
        leads: leadsData?.find(l => l.id === item.lead_id) || null
      }));
    } else {
      enrichedQueueItems = queueItems || [];
    }

    if (queueError) {
      console.error('Queue fetch error:', queueError);
      return NextResponse.json({ error: queueError.message }, { status: 500 });
    }

    if (!enrichedQueueItems || enrichedQueueItems.length === 0) {
      return NextResponse.json({ message: 'No emails to send (paused or empty queue)', processed: 0 });
    }

    let successCount = 0;
    let failureCount = 0;
    const errors: string[] = [];

    // Process each email
    for (const item of enrichedQueueItems) {
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
        let body = replaceTemplateVariables(campaign.email_body, lead);
        
        // Add email tracking (pixel + link tracking)
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
        body = addEmailTracking(body, item.campaign_lead_id, baseUrl);
        
        // Convert to HTML for tracking pixel support
        const htmlBody = convertToHtml(body);

        let success = false;
        let errorMessage = '';

        // Try sending via Gmail OAuth
        if (gmailConnection) {
          try {
            // Check if token is expired and refresh if needed
            let accessToken = gmailConnection.access_token;
            let expiryDate = gmailConnection.expiry_date;

            if (isTokenExpired(gmailConnection.expiry_date)) {
              console.log('Gmail token expired, refreshing...');
              
              if (!gmailConnection.refresh_token) {
                throw new Error('No refresh token available - please reconnect Gmail in Settings');
              }

              const refreshed = await refreshGmailToken(
                user.id,
                gmailConnection.refresh_token,
                supabase
              );

              if (refreshed) {
                accessToken = refreshed.access_token;
                expiryDate = new Date(refreshed.expiry_date).toISOString();
                console.log('✓ Token refreshed successfully');
              } else {
                throw new Error('Failed to refresh token - please reconnect Gmail in Settings');
              }
            }

            const oauth2Client = new google.auth.OAuth2(
              process.env.GOOGLE_CLIENT_ID!,
              process.env.GOOGLE_CLIENT_SECRET!,
              `${process.env.NEXT_PUBLIC_BASE_URL}/api/auth/google/callback`
            );

            oauth2Client.setCredentials({
              access_token: accessToken,
              refresh_token: gmailConnection.refresh_token,
              expiry_date: expiryDate
                ? new Date(expiryDate).getTime()
                : undefined,
            });

            const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

            const message = [
              `To: ${lead.email}`,
              `Subject: ${subject}`,
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
            console.log(`✓ Sent via Gmail to ${lead.email}`);
          } catch (err: any) {
            console.error('Gmail send error:', err.message || err);
            errorMessage = err.message;
            
            // Check for specific OAuth errors
            if (err.message?.includes('invalid_grant') || err.message?.includes('refresh token')) {
              errorMessage = 'Gmail connection expired - please reconnect in Settings';
              errors.push('Gmail connection expired');
            } else {
              // For other errors, just log but don't spam user
              errors.push('Gmail send failed');
            }
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
              html: htmlBody,
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
            // Use Gmail's from_email if available, otherwise use Resend test domain
            const fromAddress = gmailConnection?.from_email 
              ? `Gostwrk <${gmailConnection.from_email}>`
              : 'Gostwrk <onboarding@resend.dev>';
            
            await resend.emails.send({
              from: fromAddress,
              to: lead.email,
              subject: subject,
              html: htmlBody,
              tags: [
                { name: 'campaign_id', value: item.campaign_id },
                { name: 'campaign_lead_id', value: item.campaign_lead_id },
              ],
            });

            success = true;
            console.log(`Sent via Resend to ${lead.email} from ${fromAddress}`);
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

          // Get user's loop settings
          const { data: settings } = await supabase
            .from('automation_settings')
            .select('loop_after_days')
            .eq('user_id', user.id)
            .single();

          const loopDays = settings?.loop_after_days || 14;
          
          // Calculate next_email_at (null if loop is disabled)
          let nextEmailAt = null;
          if (loopDays > 0) {
            const nextDate = new Date();
            nextDate.setDate(nextDate.getDate() + loopDays);
            nextEmailAt = nextDate.toISOString();
          }

          // Get current loop_count
          const { data: currentLead } = await supabase
            .from('campaign_leads')
            .select('loop_count')
            .eq('campaign_id', item.campaign_id)
            .eq('lead_id', item.lead_id)
            .single();

          const currentLoopCount = currentLead?.loop_count || 0;

          await supabase
            .from('campaign_leads')
            .update({
              status: 'sent',
              sent_at: new Date().toISOString(),
              next_email_at: nextEmailAt,
              loop_count: currentLoopCount + 1,
            })
            .eq('campaign_id', item.campaign_id)
            .eq('lead_id', item.lead_id);

          successCount++;
        } else {
          // Detect if this is a bounce (permanent failure) vs temporary failure
          const isBounce = 
            errorMessage.toLowerCase().includes('recipient address rejected') ||
            errorMessage.toLowerCase().includes('user unknown') ||
            errorMessage.toLowerCase().includes('mailbox not found') ||
            errorMessage.toLowerCase().includes('no such user') ||
            errorMessage.toLowerCase().includes('invalid recipient') ||
            errorMessage.toLowerCase().includes('address not found') ||
            errorMessage.toLowerCase().includes('does not exist') ||
            errorMessage.toLowerCase().includes('550') || // SMTP permanent failure
            errorMessage.toLowerCase().includes('554'); // SMTP transaction failed

          const status = isBounce ? 'bounced' : 'failed';
          
          // Mark queue item as failed
          await supabase
            .from('email_queue')
            .update({
              status: 'failed',
              last_error: errorMessage,
              attempts: item.attempts + 1,
              updated_at: new Date().toISOString(),
            })
            .eq('id', item.id);

          // Mark campaign lead appropriately
          const leadUpdate: any = {
            status: status,
            error_message: errorMessage,
          };

          if (isBounce) {
            leadUpdate.bounced_at = new Date().toISOString();
            leadUpdate.bounce_reason = errorMessage;
          }

          await supabase
            .from('campaign_leads')
            .update(leadUpdate)
            .eq('campaign_id', item.campaign_id)
            .eq('lead_id', item.lead_id);

          failureCount++;
          if (!errors.includes(errorMessage)) {
            errors.push(errorMessage);
          }
          
          console.log(`Email ${isBounce ? 'bounced' : 'failed'} for ${lead.email}: ${errorMessage}`);
        }
      } catch (err: any) {
        console.error('Error processing queue item:', err);
        failureCount++;
        errors.push(err.message);
      }
    }

    return NextResponse.json({
      message: 'Queue processed',
      processed: successCount + failureCount,
      success: successCount,
      failed: failureCount,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err: any) {
    console.error('Queue processor error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
