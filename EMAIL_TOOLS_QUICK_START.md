# Email Quality Tools - Quick Start

## Two Powerful Features for Clean Leads

### 1️⃣ Email Validator & Domain Blocker
**Eliminate invalid and auto-generated emails**

- Automatically flags bad email formats
- Blocks placeholder domains (noreply.com, placeholder.com, etc.)
- User-defined blocklist for CRM auto-filled emails

### 2️⃣ AI Email Finder
**Find missing emails and fix typos with AI**

- Uses OpenAI to suggest likely email addresses
- Based on lead name + company
- Fixes misspelled emails
- High/Medium/Low confidence ratings

---

## Quick Setup (3 Steps)

### Step 1: Run SQL Migration
```sql
-- Open Supabase Dashboard → SQL Editor
-- Copy and run: supabase-email-validation.sql
```

### Step 2: Restart Dev Server
```bash
^C
npm run dev
```

### Step 3: Test It
1. Go to **/leads** page
2. See "Email Quality Tools" bar at top
3. Click buttons to validate and find emails

---

## How to Use

### Validate Emails
1. Click **🚫 Manage Blocked Domains**
2. Add domains to block (e.g., "placeholder.com", "leadservice.com")
3. Click **✓ Validate All Emails**
4. See results: Valid ✅, Invalid ❌, Blocked 🚫, Missing ❓

### Find Missing Emails with AI
1. First run validation (marks problematic leads)
2. Click **🤖 Find Missing Emails (AI)**
3. AI suggests emails for leads with name + company
4. Review suggestions in leads table (🤖 badge)
5. Manually apply suggestions you trust

---

## Visual Indicators

**Email Status Badges in Leads Table:**
- **✓ Green**: Valid email - safe to send
- **✗ Red**: Invalid - DO NOT SEND
- **? Yellow**: Missing - needs email
- **🤖 Blue**: AI suggested - review first

---

## Example Workflow

**Problem**: CRM auto-fills fake emails like "noreply@crm-provider.com"

**Solution**:
1. Add "crm-provider.com" to blocked domains
2. Run "Validate All Emails" → flags those leads
3. Run "AI Email Finder" → suggests real emails
4. Review and apply suggestions

---

## Cost Control

**Validation**: FREE - runs on your server
**AI Email Finder**: Uses OpenAI API
- Processes max 10 leads per run
- Only runs on leads with name + company
- ~$0.01-0.05 per batch (very cheap)

---

## Files Created

**SQL**: `supabase-email-validation.sql`
**Component**: `src/app/leads/EmailToolsBar.tsx`
**APIs**: `/api/leads/validate-emails`, `/api/leads/find-emails`, `/api/blocked-domains/*`
**Docs**: `EMAIL_QUALITY_TOOLS.md` (full guide)

---

## What's Next?

After setup, you can:
1. ✅ Clean up existing leads before campaigns
2. 🚫 Block your CRM's placeholder domains
3. 🤖 Use AI to fill missing emails
4. 📊 See validation status in leads table
5. 🎯 Send campaigns only to valid emails (coming soon: auto-filter)

---

**Ready to clean your leads!** 🧹✨
