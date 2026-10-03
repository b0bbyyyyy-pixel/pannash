import { fireDueCalendarPings } from '@/lib/casper/calendarPing';
import { serviceClient } from '@/lib/telephony/twilio';

let started = false;
let inFlight = false;

async function tick() {
  if (inFlight) return;
  inFlight = true;
  try {
    const sent = await fireDueCalendarPings(serviceClient());
    if (sent) console.log('[ping-cron] calendar pings sent', sent);
  } catch (err) {
    console.error('[ping-cron]', err);
  } finally {
    inFlight = false;
  }
}

/** Long-lived Node server (Railway). Skipped on Vercel Hobby. */
export function startBackgroundPingCron() {
  if (started) return;
  if (process.env.VERCEL) return;
  started = true;
  console.log('[ping-cron] checking calendar pings every 60s');
  setTimeout(tick, 8_000);
  setInterval(tick, 60_000);
}
