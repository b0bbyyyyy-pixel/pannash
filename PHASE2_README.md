# Phase 2: Smart Queue & Actual Sending

## 🎉 What's New

Phase 2 adds the complete email sending automation system with human-like pacing!

### ✅ Features Implemented

1. **Queue System** - Emails are queued with randomized send times
2. **Business Hours Logic** - Only sends 9 AM - 6 PM
3. **Random Delays** - 30-300 seconds between emails (human-like)
4. **Real Sending** - Uses your connected Gmail/Outlook
5. **Template Variables** - Replaces `[Name]`, `[Company]`, `[Email]`, `[Phone]`, `[Notes]`
6. **Status Tracking** - Updates lead status: pending → queued → sent
7. **Queue Processor** - API route to process and send emails

---

## 🚀 How to Test

### **1. Create a Campaign with Test Leads**

1. Go to: http://localhost:3000/campaigns/new
2. Fill in:
   - **Campaign Name:** "Test Campaign"
   - **Subject:** "Hi [Name]!"
   - **Body:**
     ```
     Hi [Name],
     
     I noticed [Company] is doing great work.
     
     Would love to connect!
     
     Best,
     Your Name
     ```
3. **Select all test leads** (from `test-leads.csv`)
4. Click **"Save as Draft"**

### **2. Activate the Campaign**

1. Go to campaign detail page (redirects automatically)
2. Click **"Activate"** button
3. Confirm the activation
4. Should see: "✅ Campaign activated! 10 emails queued for sending."

**What happens:**
- All leads change status from `pending` → `queued`
- `email_queue` table is populated with randomized send times
- First email scheduled for next business hour (9 AM - 6 PM)
- Subsequent emails have 30-300 second delays

### **3. Process the Queue (Manual Testing)**

1. Go to: http://localhost:3000/dashboard
2. Scroll to **"Queue Processor (Testing)"** section
3. Click **"Process Queue Now"**

**What happens:**
- Checks `email_queue` for emails ready to send (scheduled_for <= now)
- Sends up to 10 emails
- Uses your connected Gmail or Outlook
- Updates lead status to `sent`
- Shows result: processed, success, failed counts

### **4. Watch the Magic!**

**On the campaign detail page:**
- Refresh to see updated stats
- "Sent" count increases
- Lead statuses update from `queued` → `sent`
- `Sent At` timestamps appear

**Check your email:**
- Test emails arrive at `@example.com` addresses (won't deliver - fake)
- OR create a campaign with YOUR email to test real delivery

---

## 🗂️ New Files Created

### **Backend Logic**

1. **`src/lib/queue.ts`** - Queue utilities
   - `getRandomDelay()` - 30-300 second random delays
   - `isBusinessHours()` - Check if 9 AM - 6 PM
   - `getNextBusinessHour()` - Calculate next valid send time
   - `generateScheduledTimes()` - Create schedule for all emails
   - `replaceTemplateVariables()` - Replace [Name], [Company], etc.

2. **`src/app/api/queue/process/route.ts`** - Queue processor
   - Fetches pending emails (scheduled_for <= now)
   - Sends via Gmail OAuth → Outlook SMTP → Resend fallback
   - Updates `email_queue` and `campaign_leads` status
   - Handles errors and retries

3. **`src/app/api/campaigns/[id]/activate/route.ts`** - Campaign activation
   - Verifies campaign ownership
   - Generates scheduled times for all leads
   - Populates `email_queue` table
   - Updates campaign status to `active`

### **Frontend Components**

4. **`src/app/campaigns/[id]/ActivateButton.tsx`** - Activate button
   - Client component with confirmation dialog
   - Calls activation API
   - Shows success/error messages

5. **`src/app/dashboard/ProcessQueueButton.tsx`** - Manual queue processor
   - For testing/debugging
   - Triggers queue processing manually
   - Shows results in real-time

---

## 📊 Database Flow

### When Campaign is Activated:

```
campaigns
  status: draft → active

campaign_leads
  status: pending → queued

email_queue (new rows created)
  - campaign_id
  - lead_id
  - scheduled_for (with random delays)
  - status: pending
```

### When Queue is Processed:

```
email_queue
  status: pending → sending → sent (or failed)
  sent_at timestamp added

campaign_leads
  status: queued → sent (or failed)
  sent_at timestamp added
```

---

## ⏰ Scheduling Logic

### Business Hours
- **Start:** 9:00 AM
- **End:** 6:00 PM
- **Days:** Monday - Sunday (7 days)

### Random Delays
- **Minimum:** 30 seconds
- **Maximum:** 300 seconds (5 minutes)
- **Average:** ~2.75 minutes between emails

### Example Schedule:
```
Lead 1: 9:00:00 AM  (now)
Lead 2: 9:02:45 AM  (+165 seconds)
Lead 3: 9:06:30 AM  (+225 seconds)
Lead 4: 9:07:45 AM  (+75 seconds)
... continues with random delays ...
Lead 10: 9:25:12 AM
```

If any email would be scheduled after 6 PM, it rolls over to 9 AM the next day.

---

## 🧪 Template Variables

### Supported Variables:
- `[Name]` → Lead's name
- `[Company]` → Lead's company
- `[Email]` → Lead's email
- `[Phone]` → Lead's phone
- `[Notes]` → Lead's notes

### Example:
**Template:**
```
Hi [Name],

I noticed [Company] is doing great work in the industry.

Best,
Your Name
```

**Rendered (for "John Doe" at "Acme Corp"):**
```
Hi John Doe,

I noticed Acme Corp is doing great work in the industry.

Best,
Your Name
```

---

## 🔐 Security

- ✅ **Authentication required** - All API routes check user session
- ✅ **Campaign ownership verified** - Users can only activate their own campaigns
- ✅ **Email credentials secure** - Stored in Supabase with RLS
- ✅ **No token exposure** - OAuth tokens stay server-side

---

## 🚨 Important Notes

### For Production:

1. **Cron Job Required** - Set up a cron job to call `/api/queue/process` every minute:
   ```bash
   * * * * * curl -X POST https://your-app.vercel.app/api/queue/process
   ```

2. **Vercel Cron (Recommended)**:
   Create `vercel.json`:
   ```json
   {
     "crons": [{
       "path": "/api/queue/process",
       "schedule": "* * * * *"
     }]
   }
   ```

3. **Rate Limiting** - Consider adding rate limiting to prevent abuse

4. **Error Monitoring** - Set up alerts for failed emails

### For Testing:

- Use the **"Process Queue Now"** button on the dashboard
- Check campaign detail page for real-time status updates
- Monitor your terminal for sending logs

---

## 🎯 Next Steps (Future Phases)

### Phase 3: Email Tracking & Follow-ups
- Track email opens (pixel tracking)
- Track link clicks
- Detect replies
- AI-generated follow-ups based on engagement

### Phase 4: Hot Lead Detection
- Sentiment analysis on replies
- Flag hot leads for manual takeover
- Priority notifications

### Phase 5: Phone/SMS Integration
- Twilio integration for SMS follow-ups
- Call scheduling for hot leads

---

## 📝 Testing Checklist

- [ ] Create campaign with test leads
- [ ] Activate campaign (verify queue populated)
- [ ] Check `email_queue` table in Supabase
- [ ] Process queue manually (dashboard button)
- [ ] Verify emails sent (check terminal logs)
- [ ] Check campaign stats updated
- [ ] Verify lead statuses changed to `sent`
- [ ] Test with your real email address
- [ ] Verify template variables replaced correctly
- [ ] Test business hours logic (schedule past 6 PM)

---

🎉 **Phase 2 Complete!** Your outreach automation is now fully functional!
