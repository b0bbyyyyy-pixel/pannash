# Twilio Auto-Send Activation Guide

## Current Status: Manual Mode

Your scheduled text system is **fully functional** in manual mode. When a scheduled text countdown reaches zero, it displays "READY TO SEND" with a "Copy Text" button. You manually paste the text into your phone to send.

## What's Already Built

✅ Complete scheduled text system with countdown timers  
✅ Text scheduling modal with content, date/time, and frequency  
✅ Copy-to-clipboard functionality for manual sending  
✅ Recurring text scheduling (daily, weekly, monthly, etc.)  
✅ Twilio integration code (currently commented out)  
✅ Processing API route ready for cron job activation  

## When Twilio is Approved

### Step 1: Add Twilio Credentials to Environment Variables

Add these to your `.env.local` file:

```env
TWILIO_ACCOUNT_SID=your_account_sid_here
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+1234567890
```

You can find these values in your [Twilio Console](https://console.twilio.com/).

### Step 2: Run Database Migration

Execute the SQL migration file to add the necessary columns:

```bash
# In Supabase SQL Editor, run:
/Users/robertgulinello/Desktop/Pannash/add-scheduled-texts.sql
```

Or manually execute:

```sql
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS scheduled_text_content TEXT,
ADD COLUMN IF NOT EXISTS scheduled_text_time TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS scheduled_text_frequency TEXT DEFAULT 'once',
ADD COLUMN IF NOT EXISTS last_scheduled_text_sent TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_leads_scheduled_text_time 
ON leads(scheduled_text_time) 
WHERE scheduled_text_time IS NOT NULL;
```

### Step 3: Activate Twilio Code

Open `/src/app/api/scheduled-texts/process/route.ts` and uncomment the Twilio sending code:

**Find this section (around line 45):**

```typescript
async function sendTextViaTwilio(to: string, message: string): Promise<boolean> {
  // UNCOMMENT THIS SECTION AFTER TWILIO APPROVAL:
  /*
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  ...
  */
```

**Replace it with:**

```typescript
async function sendTextViaTwilio(to: string, message: string): Promise<boolean> {
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
}
```

**Remove the temporary console.log:**

Delete these lines:
```typescript
// TEMPORARY: Return true to mark as "ready" but not actually send
// User will manually copy/paste from UI
console.log(`[MANUAL MODE] Text ready for manual send to ${to}: ${message}`);
return true;
```

### Step 4: Set Up Cron Job on Vercel

#### Option A: Vercel Cron (Recommended)

1. Create `vercel.json` in your project root:

```json
{
  "crons": [
    {
      "path": "/api/scheduled-texts/process",
      "schedule": "* * * * *"
    }
  ]
}
```

This runs every minute to check for due texts.

2. (Optional) Add cron secret for security:

Add to `.env.local`:
```env
CRON_SECRET=your-random-secret-here
```

Uncomment the auth check in `/src/app/api/scheduled-texts/process/route.ts`:
```typescript
const cronSecret = req.headers.get('authorization');
if (cronSecret !== `Bearer ${process.env.CRON_SECRET}`) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```

3. Deploy to Vercel:
```bash
git add .
git commit -m "Activate Twilio auto-send"
git push
```

#### Option B: External Cron Service

Use a service like [cron-job.org](https://cron-job.org/) or [EasyCron](https://www.easycron.com/):

1. Set up a job to POST to: `https://gostwrk.io/api/scheduled-texts/process`
2. Schedule: Every 1 minute
3. Add Authorization header if using CRON_SECRET

### Step 5: Test the Integration

1. Schedule a test text for 2 minutes in the future
2. Wait for the countdown to reach zero
3. Check that the text is sent automatically
4. Verify in Twilio console that the message was sent
5. Check that recurring texts reschedule correctly

## How It Works

### User Flow

1. User clicks "Schedule Text" button in Auto Text column
2. Modal opens with text editor, date/time picker, and frequency selector
3. User enters message, chooses send time, and frequency (once, daily, weekly, etc.)
4. Countdown timer appears showing time until send
5. When time is reached:
   - **Manual Mode**: Shows "READY TO SEND" with copy button
   - **Auto Mode**: Sends via Twilio automatically

### Technical Flow

1. Scheduled texts are stored in `leads` table with `scheduled_text_time`
2. Cron job calls `/api/scheduled-texts/process` every minute
3. API fetches all texts where `scheduled_text_time <= now`
4. For each due text:
   - Sends via Twilio
   - Updates `last_scheduled_text_sent`
   - If frequency is "once", clears `scheduled_text_time`
   - If recurring, calculates and sets next `scheduled_text_time`
5. Countdown timer updates in real-time in the UI

### Frequency Options

- **Send Once**: Sends at scheduled time, then removes from schedule
- **Daily**: Sends every day at the same time
- **Every 2 Days**: Sends every 48 hours
- **Every 3 Days**: Sends every 72 hours
- **Weekly**: Sends once per week
- **Every 2 Weeks**: Sends bi-weekly
- **Monthly**: Sends once per month

## Monitoring and Logs

Check Vercel Function Logs to monitor:
- Texts processed per cron run
- Success/failure counts
- Twilio errors (if any)
- Lead IDs that were processed

## Troubleshooting

### Texts Not Sending

1. Check Twilio credentials in environment variables
2. Verify phone numbers are in E.164 format (+1234567890)
3. Check Twilio console for error messages
4. Verify cron job is running (check Vercel dashboard)

### Countdown Not Updating

1. Check that `scheduled_text_time` is set in database
2. Verify timezone is correct in user settings
3. Refresh the dashboard page

### Wrong Phone Number Format

Twilio requires E.164 format: `+[country code][number]`
- ✅ +16318922787
- ❌ (631) 892-2787
- ❌ 631-892-2787

Add phone number validation if needed.

## Security Considerations

1. **Use CRON_SECRET** to prevent unauthorized cron calls
2. **Rate limiting**: Consider adding rate limits to prevent abuse
3. **Phone validation**: Validate phone numbers before storing
4. **Message length**: SMS segments charged separately (160 chars = 1 segment)
5. **Opt-out handling**: Add logic to check if user has opted out

## Cost Considerations

- Twilio SMS costs vary by country
- US/Canada: ~$0.0079 per segment
- Monitor usage in Twilio console
- Set up billing alerts in Twilio

## Support

If you encounter issues:
1. Check Vercel logs
2. Check Twilio logs in console
3. Verify environment variables are set
4. Test with a single message first
5. Contact Twilio support for API issues

---

**Ready to activate?** Follow the steps above in order, test thoroughly, and you'll have fully automated text messaging! 🚀
