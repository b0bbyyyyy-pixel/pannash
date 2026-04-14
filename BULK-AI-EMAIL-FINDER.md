# Bulk AI Email Finder - Individual Lead Selection

## Feature Overview

Added an **"AI Email Finder"** button to the bulk actions bar that appears when you select individual leads. This allows you to run AI Email Finder on just the leads you select, rather than processing all invalid/missing emails in the list.

---

## How It Works

### User Flow

1. **Go to Leads page**
2. **Check the boxes** next to individual leads you want to process
3. **Bulk actions bar appears** at the bottom of the screen with:
   - Count of selected leads
   - 🤖 **AI Email Finder** button (NEW!)
   - Delete Selected button
   - Cancel button
4. **Click "🤖 AI Email Finder"**
5. AI processes only the selected leads
6. Results shown in alert with:
   - Number of emails updated
   - Number skipped (already valid or missing name/company)
7. Table refreshes automatically
8. Selection cleared

---

## What Gets Processed

**AI will process a lead IF:**
- ✅ Selected by user (checked)
- ✅ Has a name
- ✅ Has a company
- ✅ Email is missing, invalid, or from blocked domain

**AI will skip a lead IF:**
- ❌ Already has valid email
- ❌ Missing name or company (can't generate email without these)

---

## Use Cases

### Use Case 1: New Leads Added to List
**Scenario:** You just uploaded 5 new leads to your "Tech Prospects" list, but only 2 of them need email help.

**How to use:**
1. Select just those 2 leads (check their boxes)
2. Click "🤖 AI Email Finder"
3. Only those 2 are processed (instead of running it on the entire list)

---

### Use Case 2: Reviewing AI Suggestions One-by-One
**Scenario:** You validated all emails and found 20 with issues. You want to review and process them individually.

**How to use:**
1. Filter to see only invalid emails (or sort by status)
2. Select the first lead
3. Click "🤖 AI Email Finder"
4. Review the result
5. Move to next lead, repeat

---

### Use Case 3: Quick Fix for Specific Leads
**Scenario:** You notice 3 specific leads have placeholder emails like "john@example.com"

**How to use:**
1. Check those 3 leads
2. Click "🤖 AI Email Finder"
3. AI replaces placeholder domains with real company domains

---

## UI/UX Details

### Bulk Actions Bar Location
- Fixed at **bottom center** of screen
- Appears when **any leads are selected**
- Black background with white text
- Z-index 50 (floats above other content)

### Button Layout (left to right)
```
[Selected count] [🤖 AI Email Finder] [Delete Selected] [Cancel]
```

### Button States
- **Normal:** Purple/maroon color (matches brand)
- **Hover:** Green color (matches brand hover)
- **Loading:** Shows "Finding..." text, button disabled
- **During delete:** AI Finder disabled (prevents conflicts)

### Success Alert
```
✅ AI Email Finder complete!

Updated 3 lead(s) with AI-suggested emails.

Skipped 2 lead(s) (already have valid emails or missing name/company).

The invalid/missing emails have been replaced.
```

### No Changes Alert
```
No email suggestions made.

5 lead(s) were skipped (already have valid emails or missing name/company).
```

---

## Technical Implementation

### New API Endpoint
**Route:** `/api/leads/find-emails-by-ids`
**Method:** POST
**Body:**
```json
{
  "leadIds": ["uuid-1", "uuid-2", "uuid-3"]
}
```

**Response:**
```json
{
  "message": "Processed 3 lead(s)",
  "suggestions": [
    {
      "leadId": "uuid-1",
      "leadName": "John Smith",
      "currentEmail": "None",
      "suggestedEmail": "john.smith@microsoft.com",
      "confidence": "high",
      "reasoning": "Standard format for large enterprise"
    }
  ],
  "skipped": 2,
  "total": 3
}
```

### Component Changes
**File:** `src/app/leads/BulkDeleteButton.tsx`

**What changed:**
- Added `finding` state for loading indicator
- Added `handleAIEmailFinder` function
- Added AI Email Finder button to JSX
- Buttons disable during operations (prevent conflicts)
- Auto-refresh and clear selection on success

### AI Logic
Uses the same enhanced AI prompt as the main Email Finder:
- Intelligent company domain research
- Multiple email pattern analysis
- Considers company size/industry
- High/medium/low confidence scoring
- Short reasoning (15 words max)

---

## Differences from Main "AI Email Finder" Button

| Feature | Main Button (Top Bar) | Bulk Button (Selection Bar) |
|---------|----------------------|----------------------------|
| **Location** | Top of page (Email Quality Tools) | Bottom center (when leads selected) |
| **Scope** | All invalid/missing in current list | Only selected leads |
| **Visibility** | Always visible | Only when leads are selected |
| **Use Case** | Process many at once | Process specific leads manually |
| **Filtering** | Automatic (invalid/missing only) | Manual (user selects) |

Both use the same AI logic and quality standards!

---

## Files Changed

### New Files
- `src/app/api/leads/find-emails-by-ids/route.ts` - New API endpoint

### Modified Files
- `src/app/leads/BulkDeleteButton.tsx` - Added AI Finder button and logic

---

## Testing

### Test 1: Basic Functionality
1. Go to Leads page
2. Select 2-3 leads with invalid/missing emails
3. Click "🤖 AI Email Finder" in bulk actions bar
4. Verify:
   - Button shows "Finding..." during processing ✅
   - Alert shows results ✅
   - Emails are updated in table ✅
   - Selection cleared after success ✅

### Test 2: Skip Valid Emails
1. Select a mix of leads (some valid, some invalid)
2. Click "🤖 AI Email Finder"
3. Verify:
   - Only invalid ones are processed ✅
   - Valid ones are skipped ✅
   - Alert shows correct counts ✅

### Test 3: Missing Name/Company
1. Select a lead without name or company
2. Click "🤖 AI Email Finder"
3. Verify:
   - Lead is skipped ✅
   - Alert says "0 updated, 1 skipped" ✅

### Test 4: All Already Valid
1. Select only leads with valid emails
2. Click "🤖 AI Email Finder"
3. Verify:
   - Alert says "All selected leads already have valid emails!" ✅

---

## Benefits

✅ **Granular control** - Process only the leads you want
✅ **Faster** - No need to process entire list
✅ **Cost-efficient** - Only use AI on selected leads
✅ **Flexible workflow** - Add leads incrementally and process them
✅ **Review-friendly** - Perfect for one-by-one review process
✅ **Non-destructive** - Only processes invalid/missing emails
✅ **Smart skipping** - Automatically skips valid emails

---

## Next Steps (Optional Enhancements)

1. **Preview before apply**
   - Show suggested emails in a modal
   - Let user approve/reject each suggestion
   - Currently auto-applies (faster but less control)

2. **Undo functionality**
   - Keep history of AI changes
   - "Undo last AI Email Finder" button

3. **Progress indicator**
   - For large selections (10+)
   - Show "Processing lead 3 of 10..."

4. **Batch size limit**
   - Prevent selecting 1000+ leads at once
   - "Please select 50 or fewer leads" warning
