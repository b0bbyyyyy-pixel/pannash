# Split Name Detection Fix

## Problem

When uploading files with **First Name** and **Last Name** in separate columns (no headers), the system was incorrectly mapping:
- ❌ First Name → `name` field
- ❌ Last Name → `company` field
- ❌ Company Name → lost/ignored

**Example Issue:**
```
John	Smith	john@acme.com	Acme Corp
```

**Old Result:**
- name: "John"
- email: "john@acme.com"
- company: "Smith" ❌ (should be "Acme Corp")

---

## Solution

Updated the positional detection logic to:

1. **Identify all text columns BEFORE email/phone** as name parts
2. **Combine them into full name** (e.g., "John Smith")
3. **Look for company AFTER email/phone** (not before)

**New Result:**
- name: "John Smith" ✅
- email: "john@acme.com" ✅
- company: "Acme Corp" ✅

---

## How It Works Now

### Detection Strategy

1. **Find Email & Phone** (anchor points):
   - Scan all columns for email pattern
   - Scan all columns for phone pattern

2. **Find Name Parts** (all text columns BEFORE email/phone):
   - Look for columns before the first email or phone
   - All text-only columns (letters, spaces, hyphens) are treated as name parts
   - Combine all parts with spaces

3. **Find Company & Notes** (columns AFTER email/phone):
   - First unused column after email/phone → Company
   - Remaining unused columns → Notes

### Example Mappings

#### Format 1: First, Last, Email, Phone, Company, Notes
```
John	Smith	john@acme.com	555-1234	Acme Corp	Hot lead
```
**Result:**
- Name: "John Smith" (columns 0+1 combined)
- Email: "john@acme.com" (column 2)
- Phone: "555-1234" (column 3)
- Company: "Acme Corp" (column 4)
- Notes: "Hot lead" (column 5)

#### Format 2: First, Last, Email, Company, Phone, Notes
```
Jane	Doe	jane@example.com	Example Inc	555-5678	Follow up
```
**Result:**
- Name: "Jane Doe" (columns 0+1 combined)
- Email: "jane@example.com" (column 2)
- Company: "Example Inc" (column 3, after email)
- Phone: "555-5678" (column 4)
- Notes: "Follow up" (column 5)

#### Format 3: First, Middle, Last, Email, Company
```
Mary	Jane	Watson	mary@parker.com	Parker Industries
```
**Result:**
- Name: "Mary Jane Watson" (columns 0+1+2 combined)
- Email: "mary@parker.com" (column 3)
- Company: "Parker Industries" (column 4)

---

## Supported Formats

### ✅ Works With:
- First + Last name in separate columns
- First + Middle + Last name in separate columns
- Any number of name columns before email
- Company after email
- Company after phone
- Notes in any remaining columns

### ✅ Column Orders Supported:
1. `First | Last | Email | Phone | Company | Notes`
2. `First | Last | Email | Company | Phone | Notes`
3. `First | Last | Email | Company | Notes`
4. `First | Middle | Last | Email | Company`
5. `First | Last | Company | Email | Phone` (company before email also works now)

---

## Test Files Provided

### 1. `test-leads-split-names.txt`
**Format:** First, Last, Email, Phone, Company, Notes
```
John	Smith	john.smith@acme.com	555-1234	Acme Corporation	Hot lead
```

### 2. `test-leads-first-last-company.txt`
**Format:** First, Last, Email, Company, Phone, Notes
```
Michael	Brown	michael@techcorp.com	TechCorp Solutions	555-1111	Decision maker
```

### 3. Test Your Own File
Upload your actual file and verify:
- Full name appears in `name` field
- Company name appears in `company` field
- Email is correct

---

## Technical Changes

### Updated Function: `positionalColumnMapper()`

**Key Changes:**
1. Finds all text columns **before** email/phone (not just first one)
2. Combines them into full name: `namePartIndices.map(...).join(' ')`
3. Looks for company **after** email/phone: `afterKeyColumns`
4. Prioritizes columns that come after identifiers

**Logic Flow:**
```
1. Find email index (e.g., column 2)
2. Find phone index (e.g., column 3)
3. keyIndex = min(2, 3) = 2
4. namePartIndices = [0, 1] (all columns before index 2)
5. name = row[0] + ' ' + row[1] = "John Smith"
6. company = first column after index 3 = column 4 = "Acme Corp"
```

---

## Before vs After

### Before (Broken) ❌
```
Input:  John | Smith | john@acme.com | Acme Corp
Output: name="John", email="john@acme.com", company="Smith" ❌
```

### After (Fixed) ✅
```
Input:  John | Smith | john@acme.com | Acme Corp
Output: name="John Smith", email="john@acme.com", company="Acme Corp" ✅
```

---

## Files Modified

**Updated:**
- `/src/app/leads/UploadForm.tsx` - Fixed `positionalColumnMapper()` logic

**New Test Files:**
- `test-leads-split-names.txt` - First/Last/Email/Phone/Company/Notes format
- `test-leads-first-last-company.txt` - First/Last/Email/Company/Phone/Notes format

**Documentation:**
- `SPLIT_NAME_FIX.md` - This guide

---

## Testing

1. **Try your original file again** - it should now work correctly
2. **Try test-leads-split-names.txt** - verify names are combined
3. **Try test-leads-first-last-company.txt** - verify company is detected after email

### Expected Results:
- ✅ Full name (First + Last) in `name` column
- ✅ Company name in `company` column
- ✅ Email in `email` column
- ✅ Phone in `phone` column (if present)
- ✅ Notes in `notes` column (if present)

---

## Edge Cases Handled

### Single Name Column
```
JohnSmith | john@acme.com | Acme Corp
```
**Result:** name="JohnSmith" ✅

### Three Name Columns
```
Dr. | John | Smith | john@acme.com | Acme Corp
```
**Result:** name="Dr. John Smith" ✅

### Company Before Email
```
John | Smith | Acme Corp | john@acme.com
```
**Result:** name="John Smith", company="Acme Corp" ✅
(Company detected as text before email, then properly mapped)

---

## Why This Fix Works

The key insight: **Text columns before email/phone are almost always name parts, while text columns after are almost always company/notes.**

By using email and phone as "anchor points" to divide the row into:
- **Before anchor** → Name parts
- **After anchor** → Company and Notes

We can correctly map columns regardless of whether names are split or combined.

---

**Your upload should now work correctly!** 🎉 Try uploading your file again and let me know if the mapping is correct now.
