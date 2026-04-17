# Auto Email Feature - Setup Guide

## Overview
The Auto Email feature is similar to Auto Text but with:
- Email template management (add/edit/delete)
- Template preview in modal
- Send Now or Schedule with frequency
- Countdown timer showing time until send
- Copy email content for manual sending

## Setup Steps

### 1. Database Migration
Run this in Supabase SQL Editor:
```
/Users/robertgulinello/Desktop/Pannash/add-scheduled-emails.sql
```

This creates:
- `scheduled_email_template_id`, `scheduled_email_time`, `scheduled_email_frequency`, `last_scheduled_email_sent` columns in `leads` table
- `email_templates` table with RLS policies

### 2. API Routes Created
✅ `/api/email-templates/route.ts` - CRUD for email templates
✅ `/api/leads/schedule-email/route.ts` - Schedule emails for leads

### 3. Frontend Implementation Status

#### Completed:
- ✅ Lead interface updated with email scheduling fields
- ✅ EmailTemplate interface created
- ✅ State variables added for schedule email modal
- ✅ Countdown logic added for scheduled emails
- ✅ Email templates fetch on component mount

#### TODO (continuing implementation):
1. Add handler functions for:
   - `openScheduleEmailModal(leadId)` - opens modal
   - `handleScheduleEmail()` - saves scheduled email
   - `clearScheduledEmail(leadId)` - clears scheduled email
   - `handleSendNow(leadId, templateId)` - immediate send (marks as ready)
   - Template CRUD functions
   
2. Update `renderCell` for `auto_email_frequency` column to show:
   - "Schedule Email" button (when not scheduled)
   - Countdown timer (when scheduled)
   - "Copy" + "Send Email" buttons (when READY)
   
3. Create Schedule Email Modal UI with:
   - Template dropdown selector
   - Email preview (subject + body from selected template)
   - "Send Now" button
   - "Schedule" section with date/time/frequency
   - "Manage Templates" button
   
4. Create Template Manager Modal with:
   - List of templates with edit/delete
   - Add new template form
   - Template fields: name, subject, body

## Key Differences from Auto Text

| Auto Text | Auto Email |
|-----------|------------|
| Text content in modal | Template preview from dropdown |
| Direct content input | Select from saved templates |
| Single field (text) | Three fields (name, subject, body) |
| `scheduled_text_content` | `scheduled_email_template_id` |

## Next Steps

Would you like me to:
1. Continue implementing the remaining frontend code?
2. Show you the modal UI code for scheduling emails?
3. Implement the template manager first?

Let me know and I'll continue building out this feature!
