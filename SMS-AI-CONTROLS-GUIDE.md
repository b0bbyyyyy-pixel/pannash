# SMS AI Reply Controls - Implementation Guide

## Overview

Added two key controls for making AI SMS replies more human and giving you control over automation:

### 1. AI Auto-Reply Toggle (Per Campaign)
- **Location**: Campaign creation page (when creating SMS campaigns)
- **Purpose**: Choose whether AI automatically replies to incoming SMS or if you want to reply manually
- **Default**: Enabled (AI replies automatically)

### 2. AI Response Delay (Global Setting)
- **Location**: Settings → Automation
- **Purpose**: Add a human-like delay before AI sends replies (2-8 minutes by default)
- **Default**: 2-8 minutes (randomized within this range)

---

## Database Changes

Run this SQL migration first:

```bash
# In Supabase SQL Editor, run:
add-sms-ai-controls.sql
```

This adds:
- `ai_replies_enabled` column to `campaigns` table (per-campaign toggle)
- `ai_response_delay_min` and `ai_response_delay_max` to `automation_settings` (global delay range)

---

## How It Works

### Creating an SMS Campaign

1. **Go to Campaigns → New Campaign**
2. Select "SMS Campaign"
3. Fill in your SMS message and AI directive
4. **NEW: AI Auto-Reply Toggle**
   - **ON** (default): AI will automatically respond to replies based on your directive
   - **OFF**: Leads can reply, but you'll need to respond manually (AI is disabled)

### Setting Response Delay

1. **Go to Settings → Automation**
2. Scroll to "AI Response Delay" section
3. Set your delay range:
   - **Minimum Delay**: Shortest time AI waits before replying (e.g., 2 minutes)
   - **Maximum Delay**: Longest time AI waits before replying (e.g., 8 minutes)
   - AI picks a **random time within this range** for each reply

**Why this matters:**
- Instant replies look robotic and automated
- A few minutes delay makes conversations feel authentic
- Randomization prevents predictable patterns

---

## Example Use Cases

### Use Case 1: Fully Automated SMS Campaign
**Setup:**
- AI Auto-Reply: **ON**
- Response Delay: **2-8 minutes**

**What happens:**
1. You send SMS to leads
2. Lead replies: "Tell me more"
3. AI waits 5 minutes (random between 2-8)
4. AI sends contextual reply based on your directive
5. Conversation continues automatically

---

### Use Case 2: Manual Reply Control
**Setup:**
- AI Auto-Reply: **OFF**
- Response Delay: Not applicable

**What happens:**
1. You send SMS to leads
2. Lead replies: "Tell me more"
3. You see the reply in your system
4. **You manually reply** (AI does nothing)
5. Full control over the conversation

---

### Use Case 3: Quick Responses
**Setup:**
- AI Auto-Reply: **ON**
- Response Delay: **0-2 minutes**

**What happens:**
- AI replies very quickly (0-2 min)
- Good for urgent/time-sensitive campaigns
- Risk: May look automated if too fast

---

### Use Case 4: Very Human Pacing
**Setup:**
- AI Auto-Reply: **ON**
- Response Delay: **5-15 minutes**

**What happens:**
- AI waits longer before replying
- Feels more like a real person (people don't always reply instantly)
- Best for cold outreach or high-value leads

---

## Technical Implementation

### Campaign Level (Toggle)

When creating an SMS campaign, the system now saves:
```json
{
  "type": "sms",
  "ai_replies_enabled": true,  // NEW: Per-campaign control
  "ai_directive": "Your AI instructions..."
}
```

### User Level (Delay Settings)

In your automation settings:
```json
{
  "ai_response_delay_min": 2,  // NEW: Minimum delay in minutes
  "ai_response_delay_max": 8   // NEW: Maximum delay in minutes
}
```

### Webhook Flow

1. Lead sends SMS → Twilio webhook receives it
2. System checks: **Is AI enabled for this campaign?**
   - If NO → Log the message, do nothing
   - If YES → Continue to step 3
3. System fetches user's delay settings (e.g., 2-8 min)
4. Picks random delay (e.g., 5 minutes)
5. AI generates response immediately (but doesn't send yet)
6. **setTimeout** schedules the send after the delay
7. After 5 minutes → SMS is sent via Twilio
8. Logged to `sms_messages` with `ai_generated: true`

---

## Important Notes

⚠️ **Delay Implementation:**
- Currently using `setTimeout` (works for dev/testing)
- For production at scale, consider a proper queue/scheduler (e.g., Redis, Bull, or database-based cron)
- If the Node.js process restarts during the delay, scheduled replies may be lost
- For critical production use, implement a persistent queue table (`scheduled_sms_replies`)

💡 **Recommendations:**
- Default delay: **2-8 minutes** (balanced, human-like)
- Cold SMS: **5-15 minutes** (more conservative)
- Warm leads: **1-5 minutes** (responsive but not instant)
- Never use 0 minutes (instant replies look robotic)

✅ **Testing:**
1. Create an SMS campaign with AI ON
2. Set delay to 1-2 minutes (for faster testing)
3. Send SMS to your own phone
4. Reply to the SMS
5. Wait for the AI response (should arrive after 1-2 min delay)
6. Check console logs for timing confirmation

---

## UI Screenshots (Where to Find Controls)

### Campaign Creation Page
```
┌─────────────────────────────────────────┐
│ Create New Campaign                      │
│                                          │
│ [Email Campaign] [SMS Campaign] ← Click │
│                                          │
│ SMS Message:                             │
│ [Text field]                             │
│                                          │
│ AI Reply Directive:                      │
│ [Text area]                              │
│                                          │
│ ┌───────────────────────────────────┐  │
│ │ AI Auto-Replies          [ON/OFF] │  │ ← NEW TOGGLE
│ │ AI will automatically respond...   │  │
│ └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

### Settings → Automation
```
┌─────────────────────────────────────────┐
│ Automation Settings                      │
│                                          │
│ ... (other settings) ...                 │
│                                          │
│ AI Response Delay                        │
│ ┌────────────────┬──────────────────┐  │
│ │ Min: [2] min   │ Max: [8] min     │  │ ← NEW INPUTS
│ └────────────────┴──────────────────┘  │
│ Example: AI waits 2-8 min before reply  │
└─────────────────────────────────────────┘
```

---

## Troubleshooting

**Q: AI isn't replying at all**
- Check if AI Auto-Reply is ON for the campaign
- Verify Twilio webhook is configured correctly
- Check console logs for errors

**Q: AI replies instantly**
- Check your delay settings in Automation
- May be set to 0-1 minutes
- Increase to 2-8 or higher

**Q: Delay doesn't work**
- Check if `ai_response_delay_min/max` columns exist in `automation_settings`
- Run the `add-sms-ai-controls.sql` migration
- Verify settings are saved (check Settings → Automation)

**Q: Want to switch from auto to manual mid-campaign**
- Currently can't edit existing campaigns
- Create a new campaign with AI OFF
- Future: Add campaign edit functionality

---

## Next Steps

**Immediate:**
1. Run SQL migration (`add-sms-ai-controls.sql`)
2. Test creating an SMS campaign with toggle
3. Test the delay settings

**Future Enhancements:**
- Edit existing campaigns (toggle AI on/off after creation)
- Per-campaign delay overrides (some campaigns need faster/slower replies)
- Queue persistence (database-backed scheduled replies)
- Manual reply interface (inbox view to reply when AI is OFF)
- SMS thread view per lead (see full conversation history)
