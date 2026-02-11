# Pannash MVP - Complete Feature Summary

**Minimalist Anti-CRM for Individual Salespeople**

Built with: Next.js 15, Supabase, OpenAI, Resend, Gmail/Outlook OAuth

---

## 🎯 Core Vision

Pannash automates sales outreach with human-like pacing, AI-powered follow-ups, and smart hot lead detection—all while keeping costs ultra-low.

### Key Differentiators:
1. **Human-like sending** - Random delays, business hours only
2. **AI cost optimization** - Smart use of AI only when needed
3. **Hot lead detection** - Auto-flags interested prospects
4. **Fully automated** - Runs in background, no manual work

---

## ✅ Phase 1: Project Setup & Auth ✅

### Features:
- Next.js 15 setup with TypeScript, Tailwind CSS
- Supabase authentication (email/password)
- Protected routes with middleware
- User dashboard

### Tech Stack:
- Next.js 15.1.3 (App Router)
- Supabase Auth + PostgreSQL
- TypeScript
- Tailwind CSS

---

## ✅ Phase 2: Campaigns & Smart Queue ✅

### Features:
- **Lead Management**
  - CSV upload for bulk lead import
  - Lead database with RLS

- **Campaign System**
  - Create campaigns with custom email templates
  - Template variables: `[Name]`, `[Company]`, `[Email]`, etc.
  - Campaign status: draft, active, paused, completed
  - Campaign detail page with real-time stats

- **Smart Email Queue**
  - Random delays (30-300 seconds between sends)
  - Business hours only (9 AM - 6 PM)
  - Automatic scheduling on campaign activation
  - Real-time status updates

- **Email Sending**
  - Gmail OAuth integration
  - Outlook SMTP support
  - Resend fallback
  - Test email functionality

- **Background Automation**
  - Auto-processor sends queued emails every 60 seconds
  - Auto-refresh on campaign pages
  - Manual "Send Ready Emails Now" button (optional)

### Database Tables:
- `leads`
- `email_connections`
- `campaigns`
- `campaign_leads`
- `email_queue`

---

## ✅ Phase 3: Email Tracking & Hot Leads ✅

### Features:
- **Email Tracking**
  - Open tracking (invisible 1x1 pixel)
  - Click tracking (all links wrapped)
  - Event logging in database
  - Real-time engagement display

- **Engagement Scoring**
  - Opens: 5 points each (max 30)
  - Clicks: 15 points each (max 45)
  - Replies: 25 points (instant hot)
  - Score range: 0-100

- **Hot Lead Detection**
  - Auto-detection every 5 minutes
  - Threshold: score ≥ 50 OR any reply
  - Hot leads dashboard
  - Engagement reasoning

- **AI Integration**
  - Follow-up generation (GPT-4o-mini)
  - Sentiment analysis for replies
  - Cost-efficient prompts

### Database Tables:
- `email_events` (opens, clicks, replies)
- `hot_leads`

---

## ✅ Phase 4: Automated Follow-ups ✅

### Features:
- **Smart Follow-up System**
  - Auto-generates for warm leads (score 5-50)
  - AI-powered contextual messages
  - Smart timing: 3 days, 1 week, 2 weeks
  - Engagement-based scheduling

- **Reply Detection**
  - Webhook endpoint for email providers
  - Sentiment analysis (positive/neutral/negative)
  - Auto-cancel follow-ups on reply
  - Positive replies → instant hot lead

- **A/B Testing**
  - Variant assignment (A or B)
  - Consistent per lead
  - 50/50 split
  - Ready for performance analysis

- **Full Automation**
  - Generate follow-ups: every 30 minutes
  - Send follow-ups: every 5 minutes
  - Completely hands-free

### Database Tables:
- `follow_ups` (scheduled, sent, failed, cancelled)

### New API Endpoints:
- `/api/followups/generate` - Create follow-ups
- `/api/followups/process` - Send follow-ups
- `/api/webhooks/reply` - Handle replies

---

## 🎨 Current UI Pages

1. **`/auth`** - Login/Signup
2. **`/dashboard`** - Main hub with quick actions
3. **`/leads`** - Upload and manage leads
4. **`/campaigns`** - List all campaigns
5. **`/campaigns/new`** - Create new campaign
6. **`/campaigns/[id]`** - Campaign detail & stats
7. **`/followups`** - View all follow-ups
8. **`/hot-leads`** - Hot leads dashboard

---

## 🤖 Automation Components

All running in background on `/dashboard`:

1. **AutoProcessor** (every 60 seconds)
   - Sends queued campaign emails

2. **AutoHotDetector** (every 5 minutes)
   - Detects high-engagement leads

3. **AutoFollowupProcessor** (dual timers)
   - Generates follow-ups (every 30 minutes)
   - Sends ready follow-ups (every 5 minutes)

**Everything runs automatically—no manual intervention needed!**

---

## 💰 Cost Analysis

### Email Sending: **FREE**
- Using user's own Gmail/Outlook account
- Resend fallback (generous free tier)

### AI Costs: **Ultra-Cheap**
- Follow-up generation: ~$0.001 per email
- Sentiment analysis: ~$0.0005 per reply
- Hot lead detection: $0 (simple scoring)

**Example monthly costs** (1,000 warm leads):
- 1,000 follow-ups: ~$1.00
- 200 replies analyzed: ~$0.10
- **Total: ~$1.10/month in AI costs**

---

## 🔐 Security Features

- Row Level Security (RLS) on all Supabase tables
- User-scoped data access
- Secure OAuth flows (Gmail)
- Environment variables for secrets
- No PII exposed in tracking URLs

---

## 📊 Database Schema

### Users & Auth (Supabase built-in)
- Users table managed by Supabase Auth

### Leads & Campaigns
- `leads` - Contact information
- `campaigns` - Email campaigns
- `campaign_leads` - Join table with status tracking
- `email_queue` - Scheduled email sends

### Email & Engagement
- `email_connections` - OAuth/SMTP credentials
- `email_events` - Open/click/reply tracking
- `follow_ups` - Automated follow-up emails
- `hot_leads` - High-engagement leads

---

## 🚀 Next: UI Overhaul

### Goals:
1. **Professional Design**
   - Modern color palette
   - Consistent components
   - Smooth animations

2. **Better UX**
   - Intuitive navigation
   - Clear call-to-actions
   - Helpful onboarding

3. **Visual Feedback**
   - Loading states
   - Success/error messages
   - Progress indicators

4. **Data Visualization**
   - Charts for engagement
   - Campaign performance graphs
   - Real-time metrics

5. **Mobile Responsive**
   - Works on all devices
   - Touch-friendly UI
   - Optimized layouts

---

## 📝 Environment Variables Needed

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxx...
SUPABASE_SERVICE_ROLE_KEY=eyJxxx... (optional)

# OpenAI
OPENAI_API_KEY=sk-xxx

# Email
RESEND_API_KEY=re_xxx

# OAuth (Gmail)
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxx

# OAuth (Outlook) - optional
MICROSOFT_CLIENT_ID=xxx
MICROSOFT_CLIENT_SECRET=xxx

# Base URL
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

---

## 🧪 Testing the Full System

### 1. Create Test Campaign
```
1. Upload test leads via /leads
2. Go to /campaigns/new
3. Create campaign with template: "Hi [Name], ..."
4. Activate campaign
5. Emails queue automatically
```

### 2. Watch Automation Work
```
- Dashboard auto-sends emails (60s intervals)
- Open test email → tracking logged
- Click link → click logged
- Wait 3 seconds → check campaign detail page
- See: 👁️1 🖱️ 1 next to lead
```

### 3. Test Hot Lead Detection
```
- Open email 3+ times
- Click link 2+ times
- Go to /hot-leads
- Click "Detect Hot Leads Now"
- See lead appear with score 50+
```

### 4. Test Follow-ups
```
- Wait for warm engagement (2 opens, score = 10)
- Go to /followups
- Click "Generate Now"
- See follow-up created, scheduled for 3 days
```

### 5. Test Reply Detection
```bash
curl -X POST http://localhost:3000/api/webhooks/reply \
  -H "Content-Type: application/json" \
  -d '{"campaign_lead_id":"xxx","reply_text":"Interested!","from":"lead@test.com"}'
```

---

## 🎊 MVP Status: COMPLETE

All core features are built and working:
- ✅ Authentication & user management
- ✅ Lead upload & management
- ✅ Campaign creation & sending
- ✅ Smart queue with human-like pacing
- ✅ Email tracking (opens & clicks)
- ✅ Hot lead detection
- ✅ AI-powered follow-ups
- ✅ Reply detection & sentiment analysis
- ✅ A/B testing framework
- ✅ Full automation (background processing)

**Next step: Make it beautiful! 🎨**

---

## 📦 Files Structure

```
Pannash/
├── src/
│   ├── app/
│   │   ├── auth/              # Login/signup
│   │   ├── dashboard/         # Main hub
│   │   ├── leads/             # Lead management
│   │   ├── campaigns/         # Campaign pages
│   │   ├── followups/         # Follow-ups dashboard
│   │   ├── hot-leads/         # Hot leads page
│   │   └── api/
│   │       ├── test-email/    # Test sending
│   │       ├── queue/         # Queue processor
│   │       ├── campaigns/     # Campaign APIs
│   │       ├── followups/     # Follow-up APIs
│   │       ├── leads/         # Lead APIs
│   │       ├── track/         # Tracking endpoints
│   │       ├── auth/          # OAuth callbacks
│   │       └── webhooks/      # Reply webhooks
│   └── lib/
│       ├── supabase.ts        # Supabase client
│       ├── queue.ts           # Queue utilities
│       ├── email-tracking.ts  # Tracking helpers
│       ├── ai-followup.ts     # AI utilities
│       └── followup-scheduler.ts # Scheduling logic
├── .env.local                 # Environment variables
├── middleware.ts              # Auth middleware
└── supabase-*.sql            # Database migrations
```

---

**Built by Bobby — Ready for UI overhaul! 🚀**
