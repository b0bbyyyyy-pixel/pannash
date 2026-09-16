/**
 * TelephonyProvider — thin abstraction so Twilio can be swapped later
 * (Telnyx/Plivo) without touching route handlers.
 *
 * Agent-first flow:
 *   1. originateAgentLeg() calls the owner's SIP desk phone.
 *   2. When the desk phone answers, Twilio fetches our /voice webhook,
 *      which returns TwiML that dials the lead.
 *   3. Status callbacks land on /voice-status and finalize the call row.
 */
import twilio from 'twilio';
import { publicAppUrl, type TwilioCreds } from './twilio';

export interface OriginateParams {
  /** Our internal dialer_calls row id — threaded through every webhook URL */
  callId: string;
  /** Owner's desk phone, e.g. sip:desk@yourdomain.sip.twilio.com */
  sipUri: string;
  /** Lead number in E.164 (passed via webhook, not dialed here) */
  leadNumber: string;
  /** Caller ID for both legs — the owner's Twilio number */
  fromNumber: string;
}

export interface OriginateResult {
  providerCallSid: string;
}

export interface TelephonyProvider {
  /** Ring the owner's desk phone. Lead is dialed by the /voice webhook TwiML. */
  originateAgentLeg(params: OriginateParams): Promise<OriginateResult>;
  /** Hang up a live call by provider SID. */
  hangup(providerCallSid: string): Promise<void>;
}

export class TwilioProvider implements TelephonyProvider {
  private client: ReturnType<typeof twilio>;

  constructor(private creds: TwilioCreds) {
    this.client = twilio(creds.accountSid, creds.authToken);
  }

  async originateAgentLeg({ callId, sipUri, fromNumber }: OriginateParams): Promise<OriginateResult> {
    const base = publicAppUrl();

    const call = await this.client.calls.create({
      // Agent leg: ring the desk phone FIRST
      to: sipUri,
      from: fromNumber,
      // When the desk phone answers, Twilio fetches this URL for TwiML.
      // The TwiML dials the lead (see /api/webhooks/twilio/voice).
      url: `${base}/api/webhooks/twilio/voice?callId=${callId}`,
      method: 'POST',
      // Status events for the AGENT leg
      statusCallback: `${base}/api/webhooks/twilio/voice-status?callId=${callId}&leg=agent`,
      statusCallbackMethod: 'POST',
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      // If the desk phone doesn't answer in 20s, give up (don't burn the list)
      timeout: 20,
    });

    return { providerCallSid: call.sid };
  }

  async hangup(providerCallSid: string): Promise<void> {
    await this.client.calls(providerCallSid).update({ status: 'completed' });
  }
}

export function makeProvider(creds: TwilioCreds): TelephonyProvider {
  return new TwilioProvider(creds);
}
