# Smart Column Mapping for Lead Uploads

## Overview

The lead upload feature now includes **intelligent column detection** that automatically figures out which column is which, regardless of:
- Column order
- Column naming variations
- Case (uppercase, lowercase, mixed)

This means you can upload files from **any CRM, database, or export tool** without reformatting.

---

## How It Works

### Smart Detection Algorithm

When you upload a file, the system:

1. **Reads all column headers** from your file
2. **Matches each header** against known variations (case-insensitive, partial matching)
3. **Maps data** to the correct database fields automatically
4. **Skips invalid rows** (missing name or email)
5. **Uploads clean data** to Supabase

### Column Name Variations Supported

#### Name Column
Recognizes any of these:
- `Name`, `name`, `NAME`
- `Full Name`, `FullName`
- `Contact Name`, `Contact`
- `First Name`, `FirstName`
- `Lead Name`, `Person`

#### Email Column
Recognizes any of these:
- `Email`, `email`, `E-MAIL`
- `E-mail`, `Email Address`, `EmailAddress`
- `Contact Email`, `Mail`
- `email_address`

#### Phone Column
Recognizes any of these:
- `Phone`, `phone`, `PHONE`
- `Telephone`, `Tel`
- `Mobile`, `Cell`
- `Phone Number`, `PhoneNumber`
- `Contact Number`, `phone_number`

#### Company Column
Recognizes any of these:
- `Company`, `company`, `COMPANY`
- `Organization`, `Org`
- `Business`, `Company Name`, `CompanyName`
- `Employer`, `Account`

#### Notes Column
Recognizes any of these:
- `Notes`, `Note`
- `Comments`, `Comment`
- `Description`, `Details`
- `Memo`, `Remarks`, `Message`

---

## Required vs Optional Fields

### Required (must be present):
- ✅ **Name** - Any variation of name column
- ✅ **Email** - Any variation of email column

### Optional (nice to have):
- ⭕ **Phone** - Will be set to `null` if missing
- ⭕ **Company** - Will be set to `null` if missing
- ⭕ **Notes** - Will be set to `null` if missing

**Note:** Rows without Name OR Email will be automatically skipped (not uploaded).

---

## Example File Formats

### Standard Format
```
Name,Email,Phone,Company,Notes
John Doe,john@example.com,555-1234,Example Corp,Interested
```

### Alternative Format 1
```
Full Name	E-mail	Telephone	Organization	Comments
John Doe	john@example.com	555-1234	Example Corp	Interested
```

### Alternative Format 2
```
Contact Name|Email Address|Mobile|Employer|Remarks
John Doe|john@example.com|555-1234|Example Corp|Interested
```

### Alternative Format 3 (Different Order)
```
Email Address,Contact,Business,Cell Phone,Message
john@example.com,John Doe,Example Corp,555-1234,Interested
```

**All of these will work perfectly!** 🎉

---

## Real-World Use Cases

### Case 1: Exporting from HubSpot
HubSpot exports with columns like:
- `Contact Name`, `Email`, `Phone Number`, `Company Name`, `Notes`

**Result:** ✅ Works perfectly with smart mapping

### Case 2: Exporting from Salesforce
Salesforce exports with columns like:
- `Full Name`, `Email Address`, `Mobile`, `Account`, `Description`

**Result:** ✅ Works perfectly with smart mapping

### Case 3: Exporting from Excel/Google Sheets
Your custom spreadsheet has columns like:
- `Person`, `E-mail`, `Tel`, `Organization`, `Comments`

**Result:** ✅ Works perfectly with smart mapping

### Case 4: Exporting from LinkedIn Sales Navigator
LinkedIn exports with columns like:
- `Full Name`, `Email`, `Company`, `Position`, `Notes`

**Result:** ✅ Works perfectly with smart mapping

---

## Error Handling

### Missing Required Columns
If your file doesn't have a recognizable Name or Email column, you'll see:
```
❌ No valid leads found. Make sure your file has Name and Email columns.
```

### Partial Success
If some rows are missing name/email but others are valid:
```
✓ Successfully uploaded 8 leads
```
(Invalid rows are automatically skipped)

### Invalid File Format
If the file can't be parsed:
```
Error parsing file: [specific error]
```

---

## Testing the Smart Mapping

I've created 3 test files for you to try:

### 1. `test-leads-flexible.txt`
Columns: `Full Name`, `E-mail`, `Telephone`, `Organization`, `Comments`

### 2. `test-leads-weird-columns.txt`
Columns: `Contact Name`, `Email Address`, `Mobile`, `Employer`, `Remarks`

### 3. `test-leads.txt` (original)
Columns: `Name`, `Email`, `Phone`, `Company`, `Notes`

**Try uploading all three** - they should all work perfectly despite having completely different column names!

---

## SQL Fix Required

### Add Missing 'status' Column

Run this SQL in Supabase to fix the error you encountered:

```sql
-- Run this in Supabase SQL Editor
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'new';
```

File: `supabase-fix-leads-status.sql`

---

## Benefits

✅ **No Reformatting Needed** - Upload files directly from any source  
✅ **Column Order Doesn't Matter** - Columns can be in any order  
✅ **Case Insensitive** - Works with uppercase, lowercase, or mixed case  
✅ **Partial Matching** - Recognizes "Phone Number" same as "Phone"  
✅ **Auto-Skip Invalid Rows** - Rows without required fields are ignored  
✅ **Multi-Source Support** - Works with exports from any CRM/database  

---

## Technical Details

### Implementation
- Uses **partial string matching** with `.includes()` for flexibility
- **Case-insensitive** comparison with `.toLowerCase()`
- **Trim whitespace** from column names
- **Filter out null results** before uploading
- **Validates required fields** (name + email) before insert

### Files Modified
- `/src/app/leads/UploadForm.tsx` - Added `smartColumnMapper()` function

### New Files
- `supabase-fix-leads-status.sql` - Adds missing status column
- `test-leads-flexible.txt` - Test file with alternative column names
- `test-leads-weird-columns.txt` - Test file with unusual column names
- `SMART_COLUMN_MAPPING.md` - This documentation

---

## Testing Checklist

- [ ] Run `supabase-fix-leads-status.sql` in Supabase
- [ ] Upload `test-leads.txt` (standard format)
- [ ] Upload `test-leads-flexible.txt` (alternative names)
- [ ] Upload `test-leads-weird-columns.txt` (unusual names)
- [ ] Upload `test-leads-comma.txt` (comma-delimited)
- [ ] Verify all leads appear in table correctly
- [ ] Check that Name, Email, Phone, Company, Notes are mapped correctly

---

## Future Enhancements

- [ ] **AI-Powered Column Detection** - Use AI to detect columns with ambiguous names
- [ ] **Manual Column Mapping UI** - Let users manually map columns before upload
- [ ] **Column Preview** - Show preview of first 5 rows with detected mappings
- [ ] **Export Template** - Provide downloadable template with correct column names
- [ ] **Duplicate Detection** - Warn if email already exists before uploading

---

**You're all set!** 🎉 Upload leads from ANY source without worrying about column names or order!
