# Phase 3 Testing Guide 🧪

Quick guide to test email tracking and hot lead detection.

---

## ✅ Prerequisites

1. Dev server running: `npm run dev`
2. OpenAI API key in `.env.local`
3. SQL migration run in Supabase (`supabase-add-tracking.sql`)
4. At least one email connection (Gmail or Outlook)
5. Test leads uploaded (use `test-leads.csv`)

---

## 🧪 Test 1: Email Tracking Setup

### Step 1: Create a Test Campaign
1. Go to `/campaigns/new`
2. Name: "Phase 3 Test"
3. Subject: "Quick question about [Company]"
4. Body:
   ```
   Hi [Name],

   I noticed your company does great work!

   Would you be interested in learning more?
   Check out our site: https://example.com

   Thanks!
   ```
5. Select 2-3 test leads
6. Click "Create & Activate Campaign"

### Step 2: Verify Tracking Code
1. Wait for an email to send (check console or queue)
2. Open the sent email in your email client
3. **View source** (in Gmail: ⋮ menu → Show original)
4. Look for:
   - `<img src="http://localhost:3000/api/track/open/..."`
   - `href="http://localhost:3000/api/track/click/..."`

✅ **Pass**: You see tracking URLs in the email source

---

## 🧪 Test 2: Open Tracking

### Step 1: Open the Email
1. Open the test email in your email client
2. Wait 2-3 seconds (for pixel to load)

### Step 2: Check Dashboard
1. Go to `/campaigns/[your-campaign-id]`
2. Look at the "Campaign Leads" table
3. Find the lead you just opened

✅ **Pass**: You see 👁️ 1 next to the lead's name

---

## 🧪 Test 3: Click Tracking

### Step 1: Click a Link
1. In the test email, click the link (https://example.com)
2. You should be redirected to example.com

### Step 2: Check Dashboard
1. Refresh the campaign detail page
2. Look at the same lead

✅ **Pass**: You see 👁️1 🖱️ 1 (or more)

---

## 🧪 Test 4: Hot Lead Detection

### Step 1: Create High Engagement
1. Open the email 3+ times (close and reopen)
2. Click the link 2+ times
3. Wait 10 seconds

### Step 2: Trigger Detection
**Option A: Manual**
1. Go to `/hot-leads`
2. Click "Detect Hot Leads Now"
3. Should show: "Checked X leads, detected 1 hot leads"

**Option B: Wait for Auto-detection**
1. Just wait (AutoHotDetector runs every 5 min)
2. Dashboard will refresh automatically

### Step 3: Check Hot Leads Page
1. Go to `/hot-leads`
2. Should see your test lead with:
   - High engagement score (50+)
   - Reasoning: "Lead clicked X links and opened Y times"

✅ **Pass**: Lead appears in hot leads table

---

## 🧪 Test 5: Real-World Scenario

### Scenario: Send to Your Own Email
1. Create a lead with your personal email
2. Create a campaign with that lead
3. Check your email inbox
4. **Do NOT open immediately**
5. Open it 2 hours later (simulate real behavior)
6. Click any links
7. Check if it appears in hot leads

✅ **Pass**: Natural engagement is tracked correctly

---

## 🐛 Troubleshooting

### Tracking Pixel Not Loading
- **Cause**: Email client blocks remote images
- **Fix**: Click "Display images" in your email client
- **Note**: Many users block images, this is normal

### Links Not Tracking
- **Check**: Are links in the email body? (not in subject)
- **Check**: Is the campaign active?
- **Check**: Is NEXT_PUBLIC_BASE_URL set correctly?

### Hot Leads Not Detected
- **Check**: Did you open/click enough? (need score ≥50)
- **Check**: Did you run detection? (manual or wait 5 min)
- **Check**: Is campaign status "sent" or "opened"? (not "draft")

### No Engagement Stats Showing
- **Check**: Did the email actually send? (check queue status)
- **Check**: Is `campaign_lead_id` correct in `email_events`?
- **Refresh**: Browser cache might show old data

---

## 📊 Expected Scores

### Opens Only
- 1 open = 5 points (cold)
- 2 opens = 10 points (cold)
- 3 opens = 15 points (warm)
- 4 opens = 20 points (warm)
- 6+ opens = 30 points (very warm)

### Opens + Clicks
- 2 opens + 1 click = 25 points (warm)
- 3 opens + 2 clicks = 45 points (almost hot)
- 2 opens + 3 clicks = 55 points (🔥 HOT)

### Replies (Instant Hot)
- Any reply = 25+ points = 🔥 **INSTANT HOT**

---

## 🎯 Success Criteria

All tests passing means:
- ✅ Emails sent with tracking code
- ✅ Opens logged to database
- ✅ Clicks logged to database
- ✅ Engagement stats display correctly
- ✅ Hot leads detected automatically
- ✅ Hot leads dashboard works

---

## 🚀 Next: Build Phase 4

Once tracking works, you can:
1. Implement automated follow-ups
2. Add reply detection (webhook)
3. Generate AI follow-ups for warm leads
4. Schedule smart follow-up timing

---

## 💡 Tips

### Privacy Note
Some email clients (Apple Mail, Gmail) use proxy servers to load images, which means:
- Opens may be logged immediately (even if user doesn't read)
- IP addresses may be Apple/Google servers (not user's real IP)
- This is a known limitation of email tracking

### Deliverability
- Tracking doesn't hurt deliverability
- Tracking URLs look like normal links
- Pixel is invisible and tiny (1x1 gif)

### Production
Before deploying:
1. Update `NEXT_PUBLIC_BASE_URL` to your production URL
2. Consider using `SUPABASE_SERVICE_ROLE_KEY` for tracking endpoints (bypasses RLS)
3. Add rate limiting to tracking endpoints (prevent abuse)

---

**Ready to test? Start with Test 1!** 🎉
