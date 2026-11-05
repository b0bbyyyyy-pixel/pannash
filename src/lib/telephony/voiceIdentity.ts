/** Twilio Client identity used by the Voice token and inbound TwiML. */

export function twilioClientIdentity() {
  const override = process.env.TWILIO_VOICE_IDENTITY?.trim();
  if (override) return override;
  // Production inbound webhooks Dial this. Local/preview use a different name so
  // a leftover localhost tab cannot ghost-ring the work phone.
  return process.env.VERCEL_ENV === 'production' ? 'agent' : 'agent-dev';
}
