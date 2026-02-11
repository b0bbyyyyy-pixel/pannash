# Quick Start: Smart Scheduling 🚀

## What You Got

### 3 New Settings in `/brains`:

1. **Spread Emails Throughout Day** (Toggle)
   - ON = Emails evenly distributed 9 AM - 6 PM
   - OFF = Random 30-300 second delays (old way)
   - **Recommendation**: Keep ON for best deliverability

2. **Auto-Start Daily at 9 AM** (Toggle)
   - ON = Automatically queue next batch every day
   - OFF = Manual queueing only
   - **Recommendation**: Keep ON for hands-free operation

3. **Loop Leads After** (Dropdown)
   - 14 days (default)
   - 30 days
   - 60 days
   - 90 days
   - Never
   - **Recommendation**: Start with 14 days

---

## How It Works

### Example: 75 Emails/Day Setting

**Morning (9:00 AM):**
```
Cron job runs → Queues 75 emails
Email 1 → Scheduled for 9:00 AM
Email 2 → Scheduled for 9:07 AM
Email 3 → Scheduled for 9:14 AM
...
Email 75 → Scheduled for 5:53 PM
```

**Throughout Day:**
```
AutoProcessor sends each email when scheduled_for time arrives
Updates status in real-time
Dashboard shows live countdown timers
```

**Next Day (9:00 AM):**
```
Cron runs again → Queues next 75 emails
Process repeats automatically
```

**After 14 Days:**
```
Lead loop runs → Resets first 75 leads to "pending"
They'll be re-queued in next daily schedule
Continuous outreach loop established
```

---

## 🧪 Test It Now

### Step 1: Configure Settings
1. Go to `/brains`
2. Set daily limit (e.g., 10 for testing)
3. Enable "Spread Throughout Day"
4. Enable "Auto-Start Daily"
5. Set loop to "14 days"
6. Click "Save Settings"

### Step 2: Trigger Daily Schedule
1. Scroll down in `/brains`
2. Click "Trigger Daily Schedule Now" (blue button)
3. See alert: "Queued X emails"

### Step 3: Watch It Work
1. Go to `/dashboard` or `/campaigns/[id]`
2. See leads table with live countdown timers
3. Watch timers tick down in real-time
4. Emails spread out over hours (not minutes!)

### Step 4: Verify Spread
Check the "Scheduled For" times:
```
Lead 1: 9:02 AM
Lead 2: 9:56 AM  (54 min later)
Lead 3: 10:49 AM (53 min later)
Lead 4: 11:44 AM (55 min later)
...

Average: ~54 minutes apart (for 10 emails over 9 hours)
With ±20% variance (human-like randomization)
```

---

## 🔥 Production Setup

### Vercel (Recommended)
1. Push code to GitHub
2. Deploy to Vercel
3. Cron jobs automatically active
4. Check Vercel dashboard → "Cron Jobs" tab
5. View execution logs

**That's it!** It just works. ✨

### Alternative: cron-job.org
If not using Vercel:
1. Sign up at cron-job.org
2. Add job: POST `https://your-domain.com/api/queue/daily-schedule`
3. Schedule: `0 9 * * *` (daily at 9 AM)
4. Add job: POST `https://your-domain.com/api/leads/reset-loop`
5. Schedule: `0 9 1,15 * *` (1st & 15th at 9 AM)

---

## 📊 Math Behind Spread Logic

### Example: 75 Emails in 9 Hours

**Business hours:**
- Start: 9 AM
- End: 6 PM
- Duration: 9 hours = 540 minutes

**Average spacing:**
- 540 minutes ÷ 75 emails = 7.2 minutes per email

**With variance:**
- Base: 7.2 minutes
- Variance: ±20% (1.44 minutes)
- Range: 5.76 - 8.64 minutes
- Feels natural and human!

**Different limits:**
- 50 emails → ~10.8 min apart
- 100 emails → ~5.4 min apart
- 150 emails → ~3.6 min apart
- 200 emails → ~2.7 min apart (getting aggressive!)

---

## 💡 Best Practices

### Starting Out
```
Daily Limit: 30-50
Spread: ON
Auto-Start: ON
Loop: 14 days
```

### Established Sender
```
Daily Limit: 75-100
Spread: ON
Auto-Start: ON
Loop: 30 days
```

### High Volume (Warm Sender)
```
Daily Limit: 150-200
Spread: ON
Auto-Start: ON
Loop: 60 days
```

---

## 🎯 What Happens Automatically

### Every Day at 9 AM:
1. ✅ Check all active campaigns
2. ✅ Find pending leads (not yet queued)
3. ✅ Queue up to X leads per campaign
4. ✅ Schedule with smart spacing
5. ✅ Continue all day

### Twice Monthly (1st & 15th at 9 AM):
1. ✅ Find leads sent > 14 days ago
2. ✅ Skip leads that replied (preserve hot leads)
3. ✅ Reset old leads to "pending"
4. ✅ They'll be re-queued in next daily schedule

### Continuously (Every 60 Seconds):
1. ✅ AutoProcessor checks queue
2. ✅ Sends emails when scheduled_for <= now
3. ✅ Updates status in real-time
4. ✅ Dashboard shows live countdown

---

## 🎊 You're All Set!

Your outreach now runs on autopilot:
- ✅ Daily queueing at 9 AM
- ✅ Smart spacing throughout day
- ✅ Automatic lead looping
- ✅ Continuous operation
- ✅ Human-like sending patterns

**Just create campaigns and let Pannash handle the rest!** 🚀

---

## 🆘 Troubleshooting

### "No emails queued"
- Check campaign status is "active"
- Verify leads have status "pending"
- Look at campaign_leads table in Supabase

### "Emails sending too fast"
- Enable "Spread Throughout Day"
- Reduce daily limit
- Check queue scheduled times

### "Not sending at all"
- Check AutoProcessor is running (dashboard)
- Verify email connection (Gmail/Outlook)
- Check browser console for errors

### "Loop not working"
- Check sent_at dates (must be > 14 days old)
- Verify campaign is "active"
- Look at API response in alert

---

**Need help?** Check `SCHEDULING_SYSTEM.md` for full documentation!
