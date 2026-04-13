import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

/**
 * SCHEDULED TEXT PROCESSOR
 * 
 * This route processes scheduled texts that are ready to send.
 * 
 * MANUAL MODE (Current - Until Twilio Approved):
 * - User manually copies text from UI when countdown shows "READY TO SEND"
 * - This route can be called to mark messages as sent after manual sending
 * 
 * AUTO MODE (After Twilio Approval):
 * - Set up a cron job (e.g., Vercel Cron, GitHub Actions) to call this route every minute
 * - Uncomment the Twilio sending code below
 * - Messages will auto-send via Twilio when time is reached
 * 
 * TO ACTIVATE TWILIO AUTO-SEND:
 * 1. Ensure TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER are in .env
 * 2. Uncomment the Twilio code in the sendText function
 * 3. Set up cron job to call: POST /api/scheduled-texts/process
 * 4. Add cron secret for security (optional but recommended)
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface ScheduledText {
  id: string;
  user_id: string;
  name: string;
  phone: string | null;
  scheduled_text_content: string;
  scheduled_text_time: string;
  scheduled_text_frequency: string;
  last_scheduled_text_sent: string | null;
}

async function sendTextViaTwilio(to: string, message: string): Promise<boolean> {
  // UNCOMMENT THIS SECTION AFTER TWILIO APPROVAL:
  /*
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    console.error('Twilio credentials not configured');
    return false;
  }

  try {
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

    const response = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        To: to,
        From: fromNumber,
        Body: message,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Twilio error:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error sending via Twilio:', error);
    return false;
  }
  */
  
  // TEMPORARY: Return true to mark as "ready" but not actually send
  // User will manually copy/paste from UI
  console.log(`[MANUAL MODE] Text ready for manual send to ${to}: ${message}`);
  return true;
}

export async function POST(req: NextRequest) {
  try {
    // Optional: Verify cron secret for security
    // const cronSecret = req.headers.get('authorization');
    // if (cronSecret !== `Bearer ${process.env.CRON_SECRET}`) {
    //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    // }

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

    const now = new Date();

    // Find all scheduled texts that are due to be sent
    const { data: dueTexts, error: fetchError } = await supabase
      .from('leads')
      .select('id, user_id, name, phone, scheduled_text_content, scheduled_text_time, scheduled_text_frequency, last_scheduled_text_sent')
      .not('scheduled_text_content', 'is', null)
      .not('scheduled_text_time', 'is', null)
      .lte('scheduled_text_time', now.toISOString())
      .returns<ScheduledText[]>();

    if (fetchError) {
      console.error('Error fetching due texts:', fetchError);
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!dueTexts || dueTexts.length === 0) {
      return NextResponse.json({ message: 'No texts due', processed: 0 });
    }

    let successCount = 0;
    let failCount = 0;

    // Process each due text
    for (const text of dueTexts) {
      if (!text.phone) {
        console.log(`Skipping lead ${text.id} - no phone number`);
        continue;
      }

      // Send text via Twilio (or mark as ready for manual send)
      const sent = await sendTextViaTwilio(text.phone, text.scheduled_text_content);

      if (sent) {
        successCount++;
        
        // Update last_scheduled_text_sent
        await supabase
          .from('leads')
          .update({ last_scheduled_text_sent: now.toISOString() })
          .eq('id', text.id);

        // Handle frequency
        if (text.scheduled_text_frequency === 'once') {
          // Clear scheduled text after one-time send
          await supabase
            .from('leads')
            .update({
              scheduled_text_time: null,
            })
            .eq('id', text.id);
        } else {
          // Calculate next send time based on frequency
          const nextSendTime = calculateNextSendTime(now, text.scheduled_text_frequency);
          await supabase
            .from('leads')
            .update({
              scheduled_text_time: nextSendTime.toISOString(),
            })
            .eq('id', text.id);
        }
      } else {
        failCount++;
      }
    }

    return NextResponse.json({ 
      message: 'Scheduled texts processed',
      processed: dueTexts.length,
      success: successCount,
      failed: failCount
    });
  } catch (error) {
    console.error('Error processing scheduled texts:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function calculateNextSendTime(currentTime: Date, frequency: string): Date {
  const next = new Date(currentTime);
  
  switch (frequency) {
    case 'daily':
      next.setDate(next.getDate() + 1);
      break;
    case 'every2days':
      next.setDate(next.getDate() + 2);
      break;
    case 'every3days':
      next.setDate(next.getDate() + 3);
      break;
    case 'weekly':
      next.setDate(next.getDate() + 7);
      break;
    case 'every2weeks':
      next.setDate(next.getDate() + 14);
      break;
    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      break;
    default:
      next.setDate(next.getDate() + 1);
  }
  
  return next;
}
