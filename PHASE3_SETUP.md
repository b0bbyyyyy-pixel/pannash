# Phase 3: Email Tracking & Smart Follow-ups

## 🎯 What We'll Build Tomorrow

Phase 3 adds intelligent engagement tracking and AI-powered follow-ups:

1. **Email Open Tracking** - Invisible pixel tracks when emails are opened
2. **Link Click Tracking** - Track which links leads click
3. **Reply Detection** - Automatically detect and log replies
4. **AI Follow-ups** - Context-aware follow-up emails based on engagement
5. **Hot Lead Flagging** - Automatic detection of high-intent leads
6. **Hot Leads Dashboard** - Dedicated page for hot leads requiring manual attention

---

## 📝 Setup Required (Do This First Tomorrow)

### **1. Run SQL Migration**

Go to: https://supabase.com/dashboard/project/clcszcalvarxflhdjuar/sql/new

Copy and run: `supabase-add-tracking.sql`

This creates:
- `email_events` table (opens, clicks, replies)
- `follow_ups` table (AI-generated follow-up emails)
- `hot_leads` table (high-engagement leads)

### **2. Get OpenAI API Key**

1. Go to: https://platform.openai.com/api-keys
2. Click "Create new secret key"
3. Copy the key (starts with `sk-...`)
4. Add to `.env.local`:
   ```
   OPENAI_API_KEY=sk-your-actual-key-here
   ```

### **3. Install OpenAI SDK**

In terminal:
```bash
npm install openai
```

---

## 🎯 Features Overview

### **1. Email Open Tracking**

**How it works:**
- Embed invisible 1x1 pixel image in every email
- Pixel URL: `https://yourapp.com/api/track/open/[unique-id]`
- When email is opened, browser loads the pixel
- API logs the "opened" event in `email_events` table
- Updates `campaign_leads.status` to "opened"
- Records `campaign_leads.opened_at` timestamp

**Privacy-friendly:**
- No personal data collected
- Only tracks that YOUR sent email was opened
- Standard practice (Gmail, Mailchimp, etc. all use this)

### **2. Link Click Tracking**

**How it works:**
- Replace links in email body with tracking links
- Original: `https://yourwebsite.com`
- Tracked: `https://yourapp.com/api/track/click/[unique-id]?url=https://yourwebsite.com`
- API logs the click, then redirects to original URL
- Updates engagement score

### **3. Reply Detection**

**How it works:**
- Set up Gmail webhook (or poll Gmail API every hour)
- When reply received, log in `email_events`
- Update `campaign_leads.status` to "replied"
- Record `campaign_leads.replied_at`
- **Trigger hot lead check** (replies = high intent)

### **4. AI Follow-ups**

**Trigger conditions:**
- Email opened but no reply after 3 days → Gentle nudge
- Email opened 2+ times → High interest follow-up
- Link clicked but no reply → "Did you have questions?" follow-up

**AI prompt example:**
```
Context:
- Lead: John Doe at Acme Corp
- Original email subject: "Quick question about Acme Corp"
- Original email sent 3 days ago
- Email opened once, no reply

Generate a short, friendly follow-up email (2-3 sentences max) that:
- References the original message
- Doesn't pressure
- Offers value or help
- Natural tone
```

**AI response:**
```
Subject: Following up - any questions?

Hi John,

Just wanted to quickly follow up on my email from Tuesday. 
No pressure at all - if now's not a good time, totally understand!

Happy to answer any questions if helpful.

Best,
[Your Name]
```

### **5. Hot Lead Detection**

**Engagement scoring:**
- Email opened: +10 points
- Link clicked: +20 points
- Replied: +50 points
- Opened 2+ times: +15 additional

**Auto-flagging:**
- Score >= 50: Flagged as hot lead
- Reason logged: "Replied with interest" or "Opened 3x + clicked link"
- Notification sent (optional: email/SMS to you)

---

## 📁 Files We'll Create Tomorrow

### **Backend - Tracking APIs**
1. `src/app/api/track/open/[id]/route.ts` - Tracking pixel endpoint
2. `src/app/api/track/click/[id]/route.ts` - Link click tracker
3. `src/app/api/webhooks/gmail/route.ts` - Gmail reply webhook

### **Backend - AI Services**
4. `src/lib/ai.ts` - OpenAI client and prompt utilities
5. `src/app/api/ai/generate-followup/route.ts` - AI follow-up generator
6. `src/app/api/ai/analyze-sentiment/route.ts` - Reply sentiment analysis

### **Backend - Hot Leads**
7. `src/lib/engagement.ts` - Engagement scoring logic
8. `src/app/api/hot-leads/check/route.ts` - Auto-check for hot leads

### **Frontend - Hot Leads Dashboard**
9. `src/app/hot-leads/page.tsx` - Hot leads dashboard
10. `src/app/campaigns/[id]/EngagementStats.tsx` - Visual engagement stats

### **Utilities**
11. `src/lib/email-tracking.ts` - Add tracking pixel and links to emails

---

## 🔐 Security & Privacy

**Email Tracking:**
- ✅ Only tracks YOUR sent emails
- ✅ No third-party tracking
- ✅ Opt-out friendly (can disable per campaign)
- ✅ GDPR-compliant (tracking your business outreach)

**AI Usage:**
- ✅ Only uses lead data you already have
- ✅ No external sharing
- ✅ Context-limited prompts (no full CRM dump)
- ✅ User approval before sending AI follow-ups (optional auto-send)

---

## 💰 Cost Optimization (Your Original Vision!)

**AI Usage Strategy:**
1. **Initial email:** ONE template (human-written or AI-refined once)
2. **Bulk sends:** Same template, no AI per email ✅ (Already implemented!)
3. **Follow-ups:** AI only for engaged leads (maybe 10-20% of list)
4. **Hot leads:** AI analysis only on replies (minimal cost)

**Estimated AI costs:**
- 100 leads campaign
- ~15 leads open email (15% open rate)
- ~5 leads need follow-up → 5 AI calls (~$0.02)
- ~2 leads reply → 2 sentiment analyses (~$0.01)
- **Total AI cost per 100 leads: ~$0.03** 🎉

Compare to: Using AI for 100 initial emails = ~$2-5 💸

---

## 🚀 Phase 3 Workflow

### **Step 1: Send Initial Emails (Already Working!)**
```
Lead Status: pending → queued → sent
```

### **Step 2: Track Engagement (New!)**
```
Lead opens email → pixel loads → log "opened" event
Lead Status: sent → opened

Lead clicks link → API logs click → redirect to URL
Engagement Score: +20

Lead replies → Gmail webhook → log "replied" event
Lead Status: opened → replied
```

### **Step 3: AI Follow-up Decision (New!)**
```
Opened but no reply after 3 days?
  → AI generates gentle follow-up
  → Schedule for next business hour
  → Send automatically

Opened 2+ times + clicked link?
  → Flag as hot lead
  → Notify you
  → AI suggests next steps
```

### **Step 4: Hot Lead Handoff (New!)**
```
High engagement score (50+)?
  → Auto-flag as hot lead
  → Show on /hot-leads page
  → You take over manually
  → AI stops automated follow-ups
```

---

## 🧪 Testing Strategy (Tomorrow)

1. **Test Tracking:**
   - Send email to your own address
   - Open it → Check `email_events` table for "opened" entry
   - Click a link → Check for "clicked" entry

2. **Test AI Follow-ups:**
   - Manually trigger follow-up generation
   - Review AI-generated email
   - Approve or edit before sending

3. **Test Hot Lead Detection:**
   - Simulate high engagement (open 3x, click, reply)
   - Check if auto-flagged in `hot_leads` table
   - View on `/hot-leads` page

---

## 📊 What You'll See Tomorrow

### **Campaign Detail Page (Enhanced):**
```
┌─────────────────────────────────────────┐
│ Engagement Stats (NEW!)                 │
│ Opens: 3  Clicks: 1  Replies: 0        │
│ [Visual engagement chart]               │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ Campaign Leads                          │
│ Name        Status    Opens  Clicks     │
│ John Doe    opened    3      1         │ ← Detailed engagement
│ Jane Smith  sent      0      0          │
└─────────────────────────────────────────┘
```

### **New Page: Hot Leads Dashboard**
```
┌─────────────────────────────────────────┐
│ 🔥 Hot Leads                            │
│ Leads requiring your attention          │
│                                         │
│ John Doe (Acme Corp)                   │
│ Score: 80 | Replied with interest      │
│ Last activity: 2 mins ago               │
│ [View Details] [Mark Contacted]        │
└─────────────────────────────────────────┘
```

---

## 🎨 UI Improvements

- 🔥 Hot lead badge on campaign page
- 📊 Engagement sparklines (visual charts)
- 🤖 AI follow-up preview before sending
- 🔔 Hot lead notifications (browser alerts)
- 📈 Campaign performance dashboard

---

## 🚀 Tomorrow's Checklist

- [ ] Run `supabase-add-tracking.sql` in Supabase
- [ ] Get OpenAI API key and add to `.env.local`
- [ ] Run `npm install openai`
- [ ] Test email tracking (send to yourself)
- [ ] Test AI follow-up generation
- [ ] Review hot lead detection
- [ ] Deploy tracking system
- [ ] Test end-to-end flow

---

## 💡 Optional Enhancements (If Time Permits)

- **Email templates library** - Save/reuse templates
- **A/B testing** - Test different subject lines
- **Unsubscribe handling** - One-click unsubscribe
- **Bounce detection** - Handle invalid emails
- **Timezone detection** - Send based on lead's timezone
- **Weekly digest** - Email you campaign stats

---

## 🎊 After Phase 3, You'll Have:

✅ Complete anti-CRM system
✅ AI-efficient automation
✅ Human-like sending pace
✅ Smart engagement tracking
✅ Automatic follow-ups
✅ Hot lead detection
✅ Ready for real sales outreach!

---

**See you tomorrow! We'll make Pannash even smarter! 🚀**
