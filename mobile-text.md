# Mobile Text

Phone login opens a Messages-style texting app at `/m/text`. Desktop stays the full CRM. Open it from Settings → Mobile Text.

Thread ids are the lead id.

## Routes

- `/m/text` — inbox
- `/m/text/[threadId]` — conversation (`threadId` is the lead id)
- `/m/text/[threadId]/contact` — read-only lead card
- `/settings/mobile-text` — open button, 390×844 preview, toggles

On an iPhone, login goes to `/m/text` unless Mobile landing is off, or you tapped Open full CRM (that sets a session cookie so the desktop CRM stays put). A browser window at 430px wide or less does the same from the inbox. A normal desktop window does not redirect. `/m/text` on a wide screen stays a 390px column.

## iPhone home screen

1. Open `/m/text` in Safari while logged in.
2. Share → Add to Home Screen.
3. Open Gostwrk Text from the home screen.
4. Tap Allow on the reply-alerts banner so Web Push can subscribe.

Reply notifications only work from that installed app, not from a Safari tab.

## Env

```
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:you@yourdomain.com
MOBILE_SMS_FALLBACK=1
```

Generate VAPID keys with `npx web-push generate-vapid-keys`.

Web push sends when the user toggle is on and a subscription is saved. SMS to your personal number sends only when both the Settings toggle is on and `MOBILE_SMS_FALLBACK=1`. That flag defaults off.

Run `add-mobile-text.sql` in Supabase once so the toggles and push subscription persist.

## Reused

- `inbox_conversations` / `inbox_messages` / `leads` / `lead_lists` / `text_templates`
- Twilio send: `sendTwilioSms` (same path as `/api/inbox/send`)
- Twilio inbound: `src/app/api/webhooks/twilio/route.ts` calls `notifyUserOfInboundSms` after the message is saved
- Settings chrome: same navbar page layout as User Profile
- Auth session cookies. Visiting `/m/*` asks the session cookie to last 60 days.

## New

- `src/app/m/text/**` — three screens
- `src/app/api/m/**` — thin wrappers
- `src/lib/mobile/notifyInbound.ts`
- `src/app/settings/mobile-text/**`
- `public/m/sw.js`, `public/m/manifest.webmanifest`
- `add-mobile-text.sql`
