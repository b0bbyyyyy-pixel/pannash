# SMS Campaigns - Implementation Complete 📱

## What's Been Built

Your Pannash/Gostwrk.io platform now supports **SMS campaigns** alongside email campaigns! Here's what's new:

### 1. **Database Schema** ✅
- `campaigns.type` - Tracks whether campaign is 'email' or 'sms'
- `campaigns.sms_body` - SMS message template with variables
- `campaigns.ai_directive` - Instructions for AI replies
- `phone_connections` - Stores Twilio credentials
- `sms_queue` - Queue for scheduled SMS messages
- `sms_messages` - Conversation history (inbound/outbound)
- `automation_settings.sms_frequency` - SMS sending rate (default '2-5')

### 2. **Campaign Creation** ✅
When creating a campaign, you now choose:
- **Email Campaign** - Same as before (subject, email body, tracking)
- **SMS Campaign** - NEW! (SMS message, AI directive for auto-replies)

Both types support:
- Multiple lead list selection
- Template variables ([Name], [Company], [Phone])
- Scheduled sending with smart delays
- Start/pause controls

### 3. **SMS Sending** ✅
- Integrates with **Twilio** for SMS delivery
- Smart queue processor (runs every 15 seconds)
- Respects business hours and sending limits
- Status tracking (pending → sent → delivered)

### 4. **AI Auto-Reply System** ✅
When a lead replies to your SMS:
1. **Twilio webhook** receives the message
2. System logs the reply
3. **OpenAI GPT-4o-mini** generates a response based on your directive
4. Reply is sent automatically via Twilio
5. Full conversation is logged in `sms_messages`

### 5. **Settings Page** ✅
New page at `/settings/phone` to:
- Connect Twilio account (Account SID, Auth Token, Phone Number)
- View connected numbers
- Add multiple Twilio numbers

---

## Setup Instructions

### Step 1: Run the SQL Migration

Go to your Supabase SQL Editor and run:

```bash
supabase-add-sms-system.sql
```

This creates all necessary tables, RLS policies, and indexes.

### Step 2: Configure Sending Frequency (IMPORTANT!)

**Default Settings (RECOMMENDED):**
- Email Frequency: **Moderate (5-10 minutes)**
- SMS Frequency: **Moderate (5-10 minutes)**

⚠️ **Warning:** If you try to change from Moderate, you'll see a warning about spam risks. The app will still let you change it, but:
- Faster speeds increase spam flag risk
- You acknowledge Gostwrk.io is not liable for consequences
- Use faster speeds at your own risk

### Step 3: Set Up Twilio

1. Sign up at [https://www.twilio.com/](https://www.twilio.com/)
2. Get a phone number (trial accounts get one free)
3. Find your credentials:
   - Account SID
   - Auth Token
   - Phone Number

4. Configure webhooks in Twilio Console:
   - **Incoming Messages**: `https://your-ngrok-url.ngrok-free.dev/api/webhooks/twilio`
   - **Status Callbacks**: `https://your-ngrok-url.ngrok-free.dev/api/webhooks/twilio/status`

### Step 4: Connect Twilio in Settings

1. Start your dev server: `npm run dev`
2. Go to Settings (gear icon) → **Email & Phone Connectors**
3. Scroll to Phone/SMS section
4. Enter your Twilio credentials
5. Click "Connect Twilio"

### Step 5: Create an SMS Campaign

1. Go to `/campaigns/new`
2. Select **SMS Campaign**
3. Write your SMS message:
   ```
   Hi [Name], quick question about [Company]...
   ```
4. Set AI Directive:
   ```
   You're a sales assistant trying to book a demo. 
   Be friendly and persistent but not pushy. 
   If they ask about pricing, mention starting at $99/mo.
   ```
5. Select lead lists (make sure leads have phone numbers!)
6. Click "Create SMS Campaign"

### Step 6: Start Sending

1. Open your campaign
2. Click **Start Campaign**
3. SMS will send automatically based on your schedule (default: 5-10 min intervals)
4. When leads reply, AI responds automatically!

---

## Key Differences: Email vs SMS Campaigns

| Feature | Email Campaigns | SMS Campaigns |
|---------|----------------|---------------|
| **Setup** | Gmail OAuth | Twilio API |
| **Template** | Subject + Body | Body only (max 320 chars) |
| **Tracking** | Opens, clicks, pixel | Delivery status only |
| **Variables** | [Name], [Company], [Email] | [Name], [Company], [Phone] |
| **AI Feature** | Manual follow-ups | **Auto-replies** |
| **Length** | Unlimited | 1-2 SMS segments (160/320 chars) |
| **Webhooks** | Resend | Twilio |

---

## Testing the SMS System

### Test Send Flow:
1. Create SMS campaign with your own phone number
2. Start the campaign
3. Check your phone for the message
4. Reply to it
5. AI should respond within a few seconds
6. Check `/api/sms/process` logs in terminal

### View Conversation History:
Check `sms_messages` table in Supabase to see full conversation:
```sql
SELECT * FROM sms_messages 
WHERE campaign_lead_id = 'YOUR_LEAD_ID' 
ORDER BY created_at DESC;
```

---

## API Routes Created

| Endpoint | Purpose |
|----------|---------|
| `POST /api/sms/send` | Send individual SMS |
| `POST /api/sms/process` | Process SMS queue (cron job) |
| `POST /api/webhooks/twilio` | Receive incoming SMS + AI reply |
| `POST /api/webhooks/twilio/status` | Update delivery status |
| `POST /api/settings/phone/connect` | Connect Twilio account |
| `POST /api/campaigns/create` | Create email or SMS campaign |

---

## Components Created

| Component | Location | Purpose |
|-----------|----------|---------|
| `CampaignForm` | `/campaigns/new/` | Unified form for email/SMS |
| `TwilioConnectionForm` | `/settings/phone/` | Connect Twilio |
| `AutoSMSProcessor` | `/components/` | Background SMS sender |

---

## Environment Variables

No new variables needed! Uses existing:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (for webhooks)
- `OPENAI_API_KEY` (for AI replies)
- `NEXT_PUBLIC_BASE_URL` (for ngrok)

---

## What Happens When a Lead Replies?

1. **Lead sends SMS** → "Yes, interested in a demo"
2. **Twilio webhook** → POST to `/api/webhooks/twilio`
3. **System logs** → Saves to `sms_messages` (direction: inbound)
4. **Campaign_lead updated** → Status changed to 'replied'
5. **AI prompt** → GPT-4o-mini receives:
   - Your AI directive
   - Conversation history
   - Latest message
6. **AI generates reply** → Context-aware response
7. **Twilio sends** → Reply sent via Twilio API
8. **System logs** → Saves to `sms_messages` (direction: outbound, ai_generated: true)

---

## Tips for SMS Campaigns

✅ **DO:**
- Keep messages under 160 characters (1 SMS segment)
- Use casual, conversational tone
- Set clear AI directives with specific instructions
- Test with your own number first
- Monitor Twilio usage/costs

❌ **DON'T:**
- Send too frequently (respect recipients)
- Use generic AI directives (be specific!)
- Forget to check Twilio balance
- Send to leads without phone numbers

---

## Debugging

### SMS Not Sending?
1. Check terminal for `/api/sms/process` logs
2. Verify Twilio credentials in Settings
3. Check `sms_queue` table for errors
4. Ensure campaign is "active"

### AI Not Replying?
1. Check ngrok URL is correct in Twilio console
2. Verify `OPENAI_API_KEY` is set
3. Check terminal for webhook logs
4. Test with Twilio's webhook debugger

### Leads Not Getting SMS?
1. Ensure leads have valid phone numbers (+1234567890 format)
2. Check `sms_messages` table for send attempts
3. View Twilio console for delivery status
4. Verify phone number is SMS-capable (not landline)

---

## Next Steps

Now that SMS campaigns are fully built, you can:

1. **Create your first SMS campaign** and test it
2. **Iterate on AI directives** to perfect responses
3. **Add SMS analytics** to dashboard (optional)
4. **Build SMS-specific follow-up logic** (optional)
5. **Add MMS support** for images (future feature)

---

## Questions?

The system is production-ready! Just run the SQL migration, connect Twilio, and start sending. The AI will handle replies automatically based on your directives.

Happy texting! 📱✨
