import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import twilio from 'twilio';

// POST /api/calendar/alerts — called by the client every 60s to fire due alerts
export async function POST(_req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get: (name) => cookieStore.get(name)?.value,
          set: () => {},
          remove: () => {},
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const now = new Date().toISOString();

    // Find events with alerts due now (within the last 2 min) that haven't been sent
    const { data: dueEvents, error } = await supabase
      .from('calendar_events')
      .select('*')
      .eq('user_id', user.id)
      .eq('alert_enabled', true)
      .eq('alert_sent', false)
      .lte('alert_at', now);

    if (error || !dueEvents?.length) {
      return NextResponse.json({ sent: 0 });
    }

    // Get user's Twilio connection
    const { data: connection } = await supabase
      .from('phone_connections')
      .select('*')
      .eq('user_id', user.id)
      .single();

    let sent = 0;
    for (const event of dueEvents) {
      const toPhone = event.alert_phone;
      if (!toPhone) {
        // Still mark as sent so it doesn't keep retrying
        await supabase.from('calendar_events').update({ alert_sent: true }).eq('id', event.id);
        continue;
      }

      if (connection?.twilio_account_sid && connection?.twilio_auth_token && connection?.twilio_phone_number) {
        try {
          const client = twilio(connection.twilio_account_sid, connection.twilio_auth_token);
          const dateStr = new Date(event.date + 'T12:00:00').toLocaleDateString('en-US', {
            weekday: 'long', month: 'long', day: 'numeric'
          });
          await client.messages.create({
            body: `📅 Calendar Reminder: "${event.title}" on ${dateStr}${event.notes ? `\n\n${event.notes}` : ''}`,
            from: connection.twilio_phone_number,
            to: toPhone,
          });
          sent++;
        } catch (twilioErr) {
          console.error('[calendar/alerts] Twilio error:', twilioErr);
        }
      }

      // Mark as sent regardless of Twilio result to avoid spam
      await supabase.from('calendar_events').update({ alert_sent: true }).eq('id', event.id);
    }

    return NextResponse.json({ sent });
  } catch (err) {
    console.error('[calendar/alerts]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
