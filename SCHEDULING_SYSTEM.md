# Advanced Scheduling System ✅

**Smart, Continuous, Human-like Email Sending**

---

## 🎯 Features

### 1. Spread Emails Throughout Day ⏰
Instead of sending all 75 emails in rapid succession, they're evenly distributed from 9 AM to 6 PM with natural variance.

**How it works:**
- If daily limit = 75 emails
- Business hours = 9 hours (9 AM - 6 PM)
- Average spacing = 540 minutes ÷ 75 = ~7.2 minutes per email
- Random variance = ±20% (makes it human-like)

**Example schedule for 75 emails:**
- 9:00 AM - Email 1
- 9:07 AM - Email 2 (7 min + random)
- 9:14 AM - Email 3
- ... continues throughout day ...
- 5:53 PM - Email 75

### 2. Auto-Start Daily at 9 AM 🌅
Every day at 9 AM, the system automatically:
1. Checks all active campaigns
2. Finds pending leads (not yet queued)
3. Queues up to X emails per campaign (respects daily limit)
4. Schedules them with smart spacing

**Benefits:**
- Set it and forget it
- Continuous daily outreach
- No manual intervention needed
- Works weekends too (optional)

### 3. Loop Leads After X Days 🔄
After sending to all leads, wait a configurable period before re-sending:

**Loop Options:**
- **14 days** (default) - Re-contact every 2 weeks
- **30 days** - Monthly loop
- **60 days** - Bi-monthly
- **90 days** - Quarterly
- **Never** - One-time send only

**Smart Logic:**
- Only resets leads that haven't replied
- Preserves "replied" and "hot" status
- Resets: sent → pending
- Clears: sent_at, opened_at timestamps

---

## 📁 New Files

### API Endpoints

1. **`/api/queue/daily-schedule`**
   - **Purpose**: Queue emails for the day
   - **Runs**: Every day at 9 AM (via Vercel Cron)
   - **Method**: POST
   - **What it does**:
     - Fetches all active campaigns
     - Gets up to X pending leads per campaign
     - Generates smart scheduled times
     - Creates email_queue entries
     - Updates campaign_leads to "queued"

2. **`/api/leads/reset-loop`**
   - **Purpose**: Reset old leads for re-sending
   - **Runs**: Twice monthly (1st & 15th at 9 AM)
   - **Method**: POST
   - **What it does**:
     - Finds leads sent > X days ago
     - Excludes leads that replied
     - Resets status back to "pending"
     - Clears timestamps

### Configuration

3. **`vercel.json`**
   - Configures Vercel Cron Jobs
   - Schedules:
     - Daily schedule: `0 9 * * *` (9 AM daily)
     - Lead loop: `0 9 1,15 * *` (9 AM on 1st & 15th)

### Updated Files

4. **`src/lib/queue.ts`**
   - Updated `generateScheduledTimes()` function
   - Added `spreadThroughoutDay` parameter
   - Smart spacing algorithm with ±20% variance

5. **`src/app/brains/SettingsForm.tsx`**
   - New settings:
     - Daily email limit slider (10-200)
     - Spread emails toggle
     - Auto-start daily toggle
     - Loop after dropdown (14d, 30d, 60d, 90d, never)
   - Manual trigger buttons for testing

---

## 🧪 Testing Guide

### Test Daily Scheduler

**Option 1: Manual Trigger (Recommended)**
1. Go to `/brains`
2. Click "Trigger Daily Schedule Now"
3. Check alert message (shows how many emails queued)
4. Go to campaign detail page
5. Verify emails are in queue with spread-out times

**Option 2: API Call**
```bash
curl -X POST http://localhost:3000/api/queue/daily-schedule
```

**What to expect:**
- If you have active campaign with 75 pending leads
- System queues 75 emails
- First email: ~9:00 AM
- Last email: ~5:53 PM
- Each email 5-9 minutes apart (avg 7.2 min ±20%)

### Test Lead Loop

**Option 1: Manual Trigger**
1. Go to `/brains`
2. Click "Trigger Lead Loop Now"
3. Check alert message

**Option 2: API Call**
```bash
curl -X POST http://localhost:3000/api/leads/reset-loop
```

**What to expect:**
- Finds leads sent > 14 days ago
- Resets them to "pending"
- They'll be queued in next daily schedule
- Preserves replied leads (won't reset those)

### Test Spread Logic

**Setup:**
1. Create campaign with 10 test leads
2. Go to `/brains`
3. Set daily limit to 10
4. Enable "Spread Emails Throughout Day"
5. Click "Trigger Daily Schedule Now"

**Verify:**
1. Go to campaign detail page
2. Check email queue times
3. Should see ~54 minutes between emails (540 min ÷ 10)
4. Each with slight variation (±20%)

---

## 🔧 Configuration

### Cron Schedule Format
```
* * * * *
│ │ │ │ │
│ │ │ │ └─ Day of week (0-6, Sunday=0)
│ │ │ └─── Month (1-12)
│ │ └───── Day of month (1-31)
│ └─────── Hour (0-23)
└───────── Minute (0-59)
```

**Examples:**
- `0 9 * * *` - Every day at 9 AM
- `0 9 1,15 * *` - 1st & 15th at 9 AM
- `0 9 * * 1-5` - Weekdays only at 9 AM
- `0 9 1 * *` - First day of month at 9 AM

### Current Schedule

**Daily Scheduler:**
- **Cron**: `0 9 * * *`
- **Runs**: Every day at 9 AM
- **Endpoint**: `/api/queue/daily-schedule`

**Lead Loop:**
- **Cron**: `0 9 1,15 * *`
- **Runs**: 1st and 15th of month at 9 AM
- **Endpoint**: `/api/leads/reset-loop`

---

## 📊 How It All Works Together

### Daily Flow (9 AM)

```
9:00 AM - Cron triggers /api/queue/daily-schedule
    ↓
Fetch all active campaigns
    ↓
For each campaign:
  - Get up to 75 pending leads
  - Generate smart scheduled times (spread throughout day)
  - Create email_queue entries
  - Update campaign_leads to "queued"
    ↓
Email queue now has 75 entries scheduled from 9 AM - 6 PM
    ↓
AutoProcessor (runs every 60s) sends emails when scheduled_for <= now
```

### Loop Flow (1st & 15th at 9 AM)

```
9:00 AM - Cron triggers /api/leads/reset-loop
    ↓
Fetch all active campaigns
    ↓
For each campaign:
  - Find leads sent > 14 days ago
  - Exclude leads that replied
  - Reset status to "pending"
  - Clear sent_at, opened_at timestamps
    ↓
These leads will be picked up in next daily schedule
```

### Continuous Operation

```
Day 1 (9 AM):
  - Queue 75 emails for Campaign A
  - Send throughout day (9 AM - 6 PM)

Day 2 (9 AM):
  - Queue next 75 emails
  - Send throughout day

Day 3-7:
  - Continue daily...

Day 14 (9 AM):
  - Lead loop runs
  - First 75 leads reset to pending

Day 15 (9 AM):
  - Queue includes old leads + new leads
  - Continuous loop established
```

---

## 🎛️ Settings Explained

### Daily Email Limit
- **Range**: 10-200 emails/day
- **Default**: 75
- **Purpose**: Prevent spam filters, maintain good sender reputation
- **Tip**: Start low (30-50) and increase gradually

### Spread Emails Throughout Day
- **Default**: ON
- **Purpose**: Look human, not like a bot
- **Math**: Evenly distributes emails from 9 AM - 6 PM
- **Variance**: ±20% randomization

### Auto-Start Daily at 9 AM
- **Default**: ON
- **Purpose**: Continuous operation, no manual work
- **What it does**: Queues next batch every day
- **Recommendation**: Keep ON for automation

### Loop Leads After
- **Default**: 14 days
- **Options**: 14d, 30d, 60d, 90d, never
- **Purpose**: Re-contact leads after cooling-off period
- **Smart**: Skips leads that replied

---

## 🚀 Production Deployment

### Vercel Setup (Automatic)
1. Push code to GitHub
2. Deploy to Vercel
3. Cron jobs automatically active
4. Check Vercel dashboard → Cron Jobs tab
5. View execution logs

### Alternative: External Cron Service
If not using Vercel, use cron-job.org or similar:

**Setup:**
1. Create account at cron-job.org
2. Add job: POST to `https://your-domain.com/api/queue/daily-schedule`
3. Schedule: Every day at 9 AM
4. Add job: POST to `https://your-domain.com/api/leads/reset-loop`
5. Schedule: 1st & 15th at 9 AM

---

## 💡 Tips & Best Practices

### For New Campaigns
1. Start with daily limit of 30-50
2. Enable spread throughout day
3. Use 14-day loop
4. Monitor reply rates
5. Increase limit if deliverability good

### For Established Senders
1. Can increase to 100-150/day
2. Keep spread enabled
3. Consider 30-day loop
4. Monitor spam complaints

### Deliverability Tips
- Warm up gradually (start 20/day, increase by 10 each week)
- Keep spam rate < 0.1%
- Respond to replies promptly
- Clean list (remove bounces)
- Use your own domain email

---

## 📈 Monitoring

### Check Daily Schedule
```bash
curl https://your-domain.com/api/queue/daily-schedule
```

**Response:**
```json
{
  "message": "Daily schedule complete: 75 emails queued across 1 campaigns",
  "campaigns": 1,
  "scheduled": 75,
  "timestamp": "2026-02-01T09:00:00.000Z"
}
```

### Check Lead Loop
```bash
curl https://your-domain.com/api/leads/reset-loop
```

**Response:**
```json
{
  "message": "Lead loop complete: 25 leads reset across 1 campaigns",
  "campaigns": 1,
  "reset": 25,
  "timestamp": "2026-02-01T09:00:00.000Z"
}
```

---

## 🎊 Summary

You now have:
- ✅ Smart email spreading (no bursts)
- ✅ Daily auto-queue at 9 AM
- ✅ Continuous operation (set and forget)
- ✅ Lead looping (re-contact old leads)
- ✅ Manual controls (for testing)
- ✅ Vercel Cron Jobs (automatic)

**Your outreach is now fully automated and runs like clockwork!** ⏰🚀

---

## 🛠️ Future Enhancements

### Phase 6: Advanced Scheduling
- [ ] Per-user settings in database
- [ ] Timezone-aware scheduling
- [ ] Weekend toggle (skip Sat/Sun)
- [ ] Custom business hours per user
- [ ] Per-campaign daily limits
- [ ] A/B test different send times

---

**Built with ❤️ for continuous, human-like outreach!**
