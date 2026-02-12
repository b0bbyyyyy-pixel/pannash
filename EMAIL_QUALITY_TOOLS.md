# Email Quality Tools - Complete Guide

## Overview

Two powerful features to ensure your lead emails are accurate and deliverable before sending campaigns:

1. **Email Validator & Domain Blocker** - Automatically flag invalid emails and block auto-generated placeholder emails
2. **AI Email Finder** - Use AI to discover missing emails or fix misspelled addresses

---

## Feature 1: Email Validator & Domain Blocker

### What It Does

- ✅ **Format Validation**: Checks if emails have valid syntax (e.g., `name@domain.com`)
- 🚫 **Pattern Detection**: Flags common placeholder patterns (noreply, placeholder, example.com, etc.)
- 🛡️ **Domain Blocking**: Block emails from specific domains you define
- 📊 **Batch Processing**: Validates all leads at once

### Common Auto-Generated Email Patterns Blocked

The system automatically flags emails matching these patterns:
- `noreply@*`, `no-reply@*`
- `*@placeholder.com`, `*@example.com`
- `*@test.com`, `*@invalid.com`
- `*@unknown.com`, `*@notprovided.com`
- `*@missing.com`, `*@temp.com`
- `*@localhost`, `*@127.0.0.1`

### How to Use

#### Step 1: Manage Blocked Domains

1. Go to **Leads** page
2. Click **🚫 Manage Blocked Domains**
3. Add domains to block (e.g., "crm-autofill.com", "placeholder.io")
4. Optionally add a reason (e.g., "CRM auto-generated")
5. Click **Add**

**Common domains to block:**
- CRM placeholder domains your lead provider uses
- Internal testing domains
- Known invalid domains

#### Step 2: Validate All Emails

1. Click **✓ Validate All Emails** button
2. Confirm the action
3. Wait for processing (a few seconds for 100+ leads)
4. See results:
   - ✅ Valid: Clean, properly formatted emails
   - ❌ Invalid: Bad format or placeholder emails
   - 🚫 Blocked: Emails from your blocked domain list
   - ❓ Missing: No email address provided

#### Step 3: Review Flagged Leads

- Leads table now shows status badges next to emails:
  - **✓ Green Badge**: Valid email
  - **✗ Red Badge**: Invalid email (with reason)
  - **? Yellow Badge**: Missing email
  - **🤖 Blue Badge**: AI-suggested email

- Hover over badges to see validation notes
- Invalid/missing emails will be shown in detail below the email address

### What Happens to Invalid Emails?

- Leads with `invalid` or `missing` status are **flagged** but **not deleted**
- When creating campaigns, you can filter out invalid emails (coming soon)
- You can manually review and fix them before sending

---

## Feature 2: AI Email Finder

### What It Does

- 🤖 **AI-Powered**: Uses OpenAI GPT-4o-mini to suggest likely email addresses
- 🔍 **Smart Patterns**: Analyzes common email formats (firstname.lastname@company.com, etc.)
- ✏️ **Fix Typos**: Detects and corrects misspelled emails
- 🎯 **Fill Gaps**: Generates likely emails for leads missing addresses

### How It Works

The AI analyzes:
- **Lead's Name**: "John Smith"
- **Company Name**: "Acme Corp"
- **Current Email**: "john.smit@acme.com" (typo)

Then suggests:
- **Suggested Email**: "john.smith@acme.com"
- **Confidence**: High/Medium/Low
- **Reasoning**: "Corrected typo in last name"

### Email Patterns AI Considers

- `firstname.lastname@company.com` (most common)
- `firstnamelastname@company.com`
- `f.lastname@company.com`
- `firstname@company.com`
- `flastname@company.com`
- Common variations based on company naming

### How to Use

#### Step 1: Run AI Email Finder

1. First, run **Validate All Emails** to identify problematic leads
2. Click **🤖 Find Missing Emails (AI)** button
3. Wait for AI processing (processes up to 10 leads at a time to save costs)
4. Review the results

#### Step 2: Review AI Suggestions

After processing, check your leads table:
- AI suggestions appear in `email_validation_notes`
- Shows: "AI suggested: john.smith@acme.com (high confidence)"
- Lead status changes to `ai_suggested` with 🤖 badge

#### Step 3: Manually Apply Suggestions (Current Version)

1. Review each AI suggestion in the table
2. If you agree with the suggestion, manually update the lead's email
3. Future versions will allow one-click approval of suggestions

### Limitations & Cost Control

- **Batch Limit**: Processes max 10 leads per run (to control OpenAI costs)
- **Requirements**: Lead must have `name` AND `company` for AI to work
- **Manual Approval**: You must manually update emails (one-click coming soon)
- **Best For**: High-value leads where finding the right email is critical

---

## Setup Instructions

### Step 1: Run SQL Migration

1. Open **Supabase Dashboard** → **SQL Editor**
2. Copy the contents of `supabase-email-validation.sql`
3. Run the SQL to:
   - Add `email_status` and `email_validation_notes` columns to `leads`
   - Create `blocked_domains` table
   - Set up RLS policies and indexes

### Step 2: Verify OpenAI API Key

Make sure your `.env.local` has:
```env
OPENAI_API_KEY=sk-...your-key...
```

### Step 3: Restart Dev Server

```bash
^C
npm run dev
```

---

## Workflow Examples

### Example 1: Clean Up CRM Auto-Generated Emails

**Problem**: Your lead provider auto-fills emails as `noreply@leadservice.com` when they don't have a real email.

**Solution**:
1. Add `leadservice.com` to blocked domains
2. Run **Validate All Emails**
3. See leads flagged with reason: "Email domain 'leadservice.com' is blocked"
4. Use **AI Email Finder** to try to recover real emails
5. Manually update valid suggestions

### Example 2: Fix Typos in Bulk

**Problem**: You have 200 leads but suspect some emails have typos.

**Solution**:
1. Run **Validate All Emails** to flag invalid formats
2. Review flagged emails
3. Run **AI Email Finder** (processes 10 at a time)
4. Review AI suggestions with high confidence
5. Manually apply corrections

### Example 3: Fill Missing Emails

**Problem**: You have lead names and companies but missing emails.

**Solution**:
1. Run **Validate All Emails** (marks leads as "missing")
2. Run **AI Email Finder**
3. AI generates likely email addresses based on name + company
4. Review suggestions and manually test/verify before updating

---

## Database Schema

### `leads` Table (Updated)

| Column                    | Type | Description                                      |
|---------------------------|------|--------------------------------------------------|
| `email_status`            | TEXT | 'unchecked', 'valid', 'invalid', 'missing', 'ai_suggested' |
| `email_validation_notes`  | TEXT | Details about validation result or AI suggestion |

### `blocked_domains` Table (New)

| Column      | Type      | Description                    |
|-------------|-----------|--------------------------------|
| `id`        | UUID      | Primary key                    |
| `user_id`   | UUID      | References auth.users          |
| `domain`    | TEXT      | Blocked domain (e.g., "example.com") |
| `reason`    | TEXT      | Optional reason for blocking   |
| `created_at`| TIMESTAMP | Creation timestamp             |

---

## API Endpoints

### Validate Emails
```
POST /api/leads/validate-emails
Returns: { valid: N, invalid: N, blocked: N, missing: N }
```

### Find Emails with AI
```
POST /api/leads/find-emails
Returns: { suggestions: [...], processed: N, total: N }
```

### Manage Blocked Domains
```
GET /api/blocked-domains
Returns: { domains: [...] }

POST /api/blocked-domains/add
Body: { domain: "example.com", reason: "Optional" }

POST /api/blocked-domains/remove
Body: { domainId: "uuid" }
```

---

## Visual Indicators

### Email Status Badges

- **✓ Green**: Valid, clean email - ready to send
- **✗ Red**: Invalid format or blocked domain - DO NOT SEND
- **? Yellow**: Missing email - needs to be filled
- **🤖 Blue**: AI has suggested an email - review before using

### Validation Notes

Hover over badges or check below email addresses for detailed notes:
- "Invalid email format"
- "Email domain 'placeholder.com' is blocked"
- "AI suggested: john@acme.com (high confidence)"

---

## Best Practices

### 1. Run Validation Before Campaigns
Always validate emails before creating a campaign to avoid:
- Bounce rates hurting sender reputation
- Wasted email quota on invalid addresses
- Spam flags from sending to placeholder domains

### 2. Build Your Blocklist Gradually
Start with obvious domains:
- Your CRM's placeholder domain
- Common test domains (test.com, example.com)
- Add more as you discover patterns in your leads

### 3. Use AI Selectively
AI email finding costs money (OpenAI API):
- Use it for **high-value leads** where finding the email is worth the cost
- Don't run it on every lead - validate first, then AI for critical missing emails
- Manually verify AI suggestions before trusting them

### 4. Monitor Email Quality Over Time
- Periodically re-validate your leads
- Remove or update leads with consistently invalid emails
- Track which lead sources provide clean vs. dirty data

---

## Troubleshooting

**Q: Validation says "Invalid" but the email looks correct**
- Check if the domain is in your blocked list
- Verify the email format (no spaces, correct @ symbol)
- Look at validation notes for details

**Q: AI Email Finder returns no suggestions**
- Make sure leads have both `name` AND `company` filled
- Only processes leads marked as `invalid` or `missing`
- Run validation first to mark problematic leads

**Q: AI suggested wrong email**
- AI is making educated guesses based on patterns
- Always manually verify before using
- Mark confidence level: only trust "high" confidence suggestions

**Q: Blocked domains modal not loading**
- Check browser console for errors
- Verify SQL migration ran successfully
- Refresh the page

---

## Future Enhancements (Roadmap)

- [ ] **One-Click AI Approval**: Accept AI suggestions with one click
- [ ] **Batch Email Verification**: Integrate with email verification services (ZeroBounce, etc.)
- [ ] **Auto-Exclude Invalid**: Automatically exclude invalid emails from campaigns
- [ ] **Email Quality Score**: Dashboard showing overall lead quality
- [ ] **Regex Custom Rules**: Add your own email validation patterns
- [ ] **Import Blocklist**: Upload CSV of blocked domains
- [ ] **Undo Invalid Flag**: Manually mark invalid emails as valid

---

## Files Created/Modified

**New Files:**
- `supabase-email-validation.sql` - Database schema
- `/src/app/leads/EmailToolsBar.tsx` - Main UI component with tools + modal
- `/src/app/api/leads/validate-emails/route.ts` - Validation API
- `/src/app/api/leads/find-emails/route.ts` - AI email finder API
- `/src/app/api/blocked-domains/route.ts` - Fetch blocked domains
- `/src/app/api/blocked-domains/add/route.ts` - Add blocked domain
- `/src/app/api/blocked-domains/remove/route.ts` - Remove blocked domain
- `EMAIL_QUALITY_TOOLS.md` - This documentation

**Updated Files:**
- `/src/app/leads/page.tsx` - Added EmailToolsBar component
- `/src/app/leads/LeadsTable.tsx` - Show email status badges and notes

---

## Testing Checklist

- [ ] Run `supabase-email-validation.sql` in Supabase
- [ ] Restart dev server
- [ ] Go to Leads page and see "Email Quality Tools" bar
- [ ] Click "Manage Blocked Domains" and add "example.com"
- [ ] Click "Validate All Emails" and see results
- [ ] Check leads table for status badges (✓, ✗, ?, 🤖)
- [ ] Click "Find Missing Emails (AI)" and see suggestions
- [ ] Review AI suggestions in validation notes
- [ ] Remove blocked domain from list

---

**You're all set!** 🎉 Your leads are now protected from bad emails and AI is ready to help fill the gaps.
