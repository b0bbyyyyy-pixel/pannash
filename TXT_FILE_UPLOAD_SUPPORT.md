# TXT File Upload Support

## Overview

The leads upload feature now supports both **CSV** and **TXT** files, making it easier to import leads from various sources.

## Supported File Types

### 1. CSV Files (.csv)
- Standard comma-separated values
- Header row with column names

### 2. TXT Files (.txt)
- **Tab-delimited** (most common for exports from Excel, databases)
- **Comma-delimited** (CSV format saved as .txt)
- **Pipe-delimited** (|)

The system automatically detects which delimiter is used in your TXT file.

---

## File Format Requirements

### Required Columns (any of these names work):
- **Name** / name / NAME
- **Email** / email / EMAIL

### Optional Columns:
- **Phone** / phone / PHONE
- **Company** / company / COMPANY
- **Notes** / notes / NOTES

### Header Row:
- First row must contain column names
- Case-insensitive (works with Name, name, or NAME)

---

## Example File Formats

### CSV File (test-leads.csv)
```csv
Name,Email,Phone,Company,Notes
John Smith,john@acme.com,555-1234,Acme Corp,Interested in product
Jane Doe,jane@example.com,555-5678,Example Inc,Follow up next week
```

### Tab-Delimited TXT File (test-leads.txt)
```
Name	Email	Phone	Company	Notes
John Smith	john@acme.com	555-1234	Acme Corp	Interested in product
Jane Doe	jane@example.com	555-5678	Example Inc	Follow up next week
```

### Comma-Delimited TXT File (test-leads.txt)
```
Name,Email,Phone,Company,Notes
John Smith,john@acme.com,555-1234,Acme Corp,Interested in product
Jane Doe,jane@example.com,555-5678,Example Inc,Follow up next week
```

### Pipe-Delimited TXT File (test-leads.txt)
```
Name|Email|Phone|Company|Notes
John Smith|john@acme.com|555-1234|Acme Corp|Interested in product
Jane Doe|jane@example.com|555-5678|Example Inc|Follow up next week
```

---

## How It Works

### Auto-Detection Logic

1. **File Extension Check**: Verifies file is .csv or .txt
2. **Delimiter Detection** (for TXT files):
   - Reads the first line of the file
   - Checks for tabs (`\t`) → uses tab delimiter
   - Checks for commas (`,`) → uses comma delimiter
   - Checks for pipes (`|`) → uses pipe delimiter
   - Defaults to comma if unclear
3. **Parsing**: Uses PapaParse library to parse the file
4. **Column Mapping**: Maps columns to database fields (case-insensitive)
5. **Upload**: Inserts leads into selected list (or uncategorized if no list selected)

---

## Common Use Cases

### Exporting from Excel
1. Open your Excel file with leads
2. **Save As** → Choose "Text (Tab delimited) (*.txt)"
3. Upload the .txt file to Pannash
4. ✅ Leads imported successfully

### Exporting from Google Sheets
1. **File** → **Download** → **Tab-separated values (.tsv)**
2. Rename file from `.tsv` to `.txt` (optional, but consistent)
3. Upload to Pannash
4. ✅ Leads imported successfully

### Exporting from Database/CRM
Most databases and CRMs export as:
- CSV (comma-delimited)
- TSV (tab-delimited)
- TXT (various delimiters)

All formats are now supported!

---

## Error Handling

### File Type Validation
- Only `.csv` and `.txt` files are accepted
- Other file types will show: "Please select a CSV or TXT file"

### Missing Required Columns
- If file doesn't have `Name` or `Email` columns, parsing will fail
- Error message will indicate what went wrong

### Invalid Delimiter
- If delimiter can't be detected, defaults to comma
- If parsing fails, error message will show

---

## Benefits

✅ **Flexibility**: Import from any data source  
✅ **No Conversion Needed**: Upload TXT files directly from Excel/databases  
✅ **Auto-Detection**: System figures out the delimiter automatically  
✅ **Error-Tolerant**: Handles various column name formats (case-insensitive)  
✅ **Fast**: Processes hundreds of leads in seconds  

---

## Files Modified

**Updated:**
- `/src/app/leads/UploadForm.tsx` - Added TXT file support with auto-detection

**New:**
- `TXT_FILE_UPLOAD_SUPPORT.md` - This documentation

---

## Testing

### Test with Tab-Delimited TXT:
1. Open Excel, create a simple lead list
2. Save As → Text (Tab delimited) (*.txt)
3. Go to Pannash → Leads → Upload
4. Select the .txt file
5. Click "Upload Leads"
6. ✅ Leads should appear in table

### Test with Different Delimiters:
Create test files with:
- Tabs between columns → should work
- Commas between columns → should work
- Pipes between columns → should work

---

## Future Enhancements

- [ ] Support for .xlsx (Excel) files directly
- [ ] Support for .tsv files
- [ ] Column mapping UI (custom column names)
- [ ] Preview before upload
- [ ] Duplicate detection

---

**You're all set!** 🎉 Upload leads from any source, CSV or TXT!
