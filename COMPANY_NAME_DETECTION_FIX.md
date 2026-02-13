# Company Name Detection Fix

## Problem

When uploading files with format: `First | Last | Company | Email | Phone`, the system was incorrectly combining ALL text columns before email into the name field, resulting in:

**Example Issue:**
```
George | Hamilton | George C. Hamilton Cpa Inc. Apc | gch@earthlink.net
```

**Old (Broken) Result:**
- name: "George Hamilton George C. Hamilton Cpa Inc. Apc" ❌
- company: "" (empty) ❌

**Expected Result:**
- name: "George Hamilton" ✅
- company: "George C. Hamilton Cpa Inc. Apc" ✅

---

## Root Cause

The previous logic treated ALL text columns before email/phone as "name parts" and combined them, not distinguishing between:
- Person names (short, 1-2 words like "George", "Hamilton")
- Company names (longer, with keywords like "Inc", "LLC", "Corp")

---

## Solution

Added **intelligent pattern detection** to distinguish person names from company names:

### 1. Company Name Detection

Recognizes company indicators:
- Keywords: `Inc`, `LLC`, `Corp`, `Ltd`, `Limited`, `Co`, `Group`, `Solutions`, `Services`, `Agency`, `Technologies`, etc.
- Length: Names with 5+ words are likely companies
- Structure: Text with business suffixes

### 2. Person Name Detection

Recognizes person name patterns:
- Short single words (2-20 chars, no spaces) → First or Last name
- Maximum 2-3 name parts combined
- No business keywords

### 3. Smart Separation Logic

Before email/phone:
1. Identify short name parts (e.g., "George", "Hamilton")
2. Identify company-like text (e.g., "George C. Hamilton Cpa Inc. Apc")
3. Combine max 2-3 name parts → `name` field
4. Put company text → `company` field

---

## Detection Rules

### Company Keywords Detected:
- `inc`, `llc`, `corp`, `ltd`, `limited`
- `company`, `co`, `group`, `enterprises`
- `solutions`, `services`, `consulting`, `partners`
- `agency`, `studio`, `industries`, `holdings`
- `ventures`, `capital`, `technologies`, `tech`
- `systems`, `associates`, `international`

### Name Characteristics:
- **Short**: 1-2 words, each under 20 characters
- **Letters only**: a-z, spaces, hyphens, dots
- **Max parts**: Combines up to 3 parts (First Middle Last)

### Company Characteristics:
- **Keywords**: Contains business-related terms
- **Long**: More than 4 words
- **Complex**: Multiple parts with punctuation

---

## Example Mappings

### Format: First | Last | Company | Email | Phone

#### Example 1
```
George | Hamilton | George C. Hamilton Cpa Inc. Apc | gch@earthlink.net | 626-232-7612
```
**Result:**
- name: "George Hamilton" ✅
- company: "George C. Hamilton Cpa Inc. Apc" ✅ (detected "Inc")
- email: "gch@earthlink.net" ✅
- phone: "626-232-7612" ✅

#### Example 2
```
Todd | Polifka | Custom One Homes | todd@brushmasters.com | 612-328-2835
```
**Result:**
- name: "Todd Polifka" ✅
- company: "Custom One Homes" ✅ (3+ words, no person name pattern)
- email: "todd@brushmasters.com" ✅
- phone: "612-328-2835" ✅

#### Example 3
```
Isaiah | Lipsey | Isaiah Lipsey Pc | ilipsey@aol.com | 248-730-5311
```
**Result:**
- name: "Isaiah Lipsey" ✅
- company: "Isaiah Lipsey Pc" ✅ (person's law firm)
- email: "ilipsey@aol.com" ✅
- phone: "248-730-5311" ✅

#### Example 4
```
Riley | Riley | All State Diesel Repair Llc | chelsie@hotmail.com | 502-727-4895
```
**Result:**
- name: "Riley Riley" ✅
- company: "All State Diesel Repair Llc" ✅ (detected "LLC")
- email: "chelsie@hotmail.com" ✅
- phone: "502-727-4895" ✅

---

## How It Works Now

### Detection Flow

1. **Scan all columns** for email and phone (anchor points)
2. **Analyze columns BEFORE email/phone**:
   - For each text column:
     - Check if it matches company pattern → Mark as company
     - Check if it's a short name (1 word) → Add to name parts
     - If already have 2 name parts and this is longer text → Mark as company
3. **Build name**: Combine first 2-3 name part columns
4. **Build company**: Use the column marked as company
5. **Remaining columns**: After email/phone → Notes

### Priority Order

1. **Email/Phone** (highest reliability)
2. **Short single words before email** → Name parts
3. **Text with company keywords** → Company
4. **Long multi-word text** → Company
5. **Remaining text after email** → Company or Notes

---

## Test File Provided

**`test-leads-name-company-confusion.txt`**

This file matches your exact scenario:
```
George	Hamilton	George C. Hamilton Cpa Inc. Apc	GCH@EARTHLINK.NET	6262327612
Todd	Polifka	Custom One Homes	TODD@BRUSHMASTERS.COM	6123282835
Isaiah	Lipsey	Isaiah Lipsey Pc	ILIPSEY@AOL.COM	2487305311
Riley	Riley	All State Diesel Repair Llc	CHELSIE_RILEY123@HOTMAIL.COM	5027274895
Mayke	Reyes	Mayke King Sport Llc	MAYKEREYESJR20@GMAIL.COM	7862419172
```

Upload this to verify the fix works correctly!

---

## Before vs After

### Before (Broken) ❌
```
Input:  George | Hamilton | George C. Hamilton Cpa Inc. Apc | gch@earthlink.net
Result: name="George Hamilton George C. Hamilton Cpa Inc. Apc", company="" ❌
```

### After (Fixed) ✅
```
Input:  George | Hamilton | George C. Hamilton Cpa Inc. Apc | gch@earthlink.net
Result: name="George Hamilton", company="George C. Hamilton Cpa Inc. Apc" ✅
```

---

## Edge Cases Handled

### Person's Name in Company Name
```
John | Smith | John Smith Consulting LLC | john@example.com
```
**Result:**
- name: "John Smith" ✅
- company: "John Smith Consulting LLC" ✅ (detected "LLC")

### Similar First/Last Names
```
Riley | Riley | All State Diesel Repair Llc | riley@email.com
```
**Result:**
- name: "Riley Riley" ✅
- company: "All State Diesel Repair Llc" ✅

### Short Company Names
```
Jane | Doe | ABC Corp | jane@abc.com
```
**Result:**
- name: "Jane Doe" ✅
- company: "ABC Corp" ✅ (detected "Corp")

### Long Person Names
```
Mary | Jane | Watson | Tech Solutions Inc | mary@tech.com
```
**Result:**
- name: "Mary Jane Watson" ✅ (max 3 parts)
- company: "Tech Solutions Inc" ✅

---

## Files Modified

**Updated:**
- `/src/app/leads/UploadForm.tsx` - Added `isLikelyCompany()`, `isShortName()`, and smarter positional mapping

**New Test Files:**
- `test-leads-name-company-confusion.txt` - Matches your exact data format

**Documentation:**
- `COMPANY_NAME_DETECTION_FIX.md` - This guide

---

## Testing Steps

1. **Delete your previously uploaded leads** (with incorrect mapping)
2. **Upload your original file again**
3. **Verify results**:
   - ✅ Name column shows "First Last" only
   - ✅ Company column shows company name (with Inc, LLC, etc.)
   - ✅ No company names in the Name column

Or test with:
```
test-leads-name-company-confusion.txt
```

Expected results in table:
- George Hamilton | gch@earthlink.net | 6262327612 | George C. Hamilton Cpa Inc. Apc
- Todd Polifka | todd@brushmasters.com | 6123282835 | Custom One Homes
- etc.

---

## Why This Fix Works

**Key Insight**: Business entity names have distinctive patterns (keywords like "Inc", "LLC", multi-word structure) that distinguish them from person names (short, 1-2 simple words).

By scanning for these patterns, we can accurately separate:
- **Person**: "George Hamilton" (2 short words)
- **Company**: "George C. Hamilton Cpa Inc. Apc" (contains "Inc", longer structure)

Even when both appear in the same row before the email address.

---

**Your leads should now map correctly!** 🎉 Try uploading your file again.
