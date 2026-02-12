# Lead Lists System - Complete Guide

## Overview

The Lead Lists feature allows you to organize your contacts into multiple lists (like "Q1 Prospects", "Warm Leads", "Enterprise Clients", etc.) and choose which list to target when creating campaigns.

## What's New

### 1. **Multiple Lead Lists**
- Create unlimited lead lists with custom names and descriptions
- Organize leads by campaign, industry, priority, or any category you want
- Each lead can belong to one list (or no list)

### 2. **Lead Management**
- **Delete Individual Leads**: Remove unwanted contacts with one click
- **Bulk Delete Leads**: Select multiple leads with checkboxes and delete them all at once
- **Delete Lists**: Remove entire lists (leads won't be deleted, just uncategorized)
- **Upload to Specific List**: When uploading CSV, leads automatically go to the selected list
- **Recategorize**: Upload existing leads to different lists to reorganize

### 3. **Campaign Targeting**
- Filter leads by list when creating campaigns
- See lead count per list in real-time
- Select all from one list or cherry-pick across multiple lists

---

## Setup Instructions

### Step 1: Run the SQL Migration

1. Open Supabase Dashboard → SQL Editor
2. Copy the contents of `supabase-lead-lists.sql`
3. Run the SQL to create the `lead_lists` table and update the `leads` table
4. This will:
   - Create the `lead_lists` table
   - Add `list_id` column to `leads` table
   - Set up Row Level Security (RLS) policies
   - Create necessary indexes

### Step 2: Restart Your Dev Server

```bash
# Kill existing server if running
^C

# Start fresh
npm run dev
```

---

## How to Use

### Creating Lead Lists

1. Go to **Leads** page
2. Click **+ New List** button (top right)
3. Enter:
   - **List Name**: e.g., "Q1 2026 Prospects"
   - **Description** (optional): e.g., "Enterprise leads from LinkedIn"
4. Click **Create List**

### Uploading Leads to a List

1. Go to **Leads** page
2. Click on the **list tab** you want to add leads to (or stay on "All Leads")
3. Upload your CSV file
4. Leads will automatically be added to the selected list

**If you upload while on "All Leads":**
- Leads will be created without a list (shown in "Uncategorized" tab)

**If you upload while on a specific list tab:**
- Leads will be assigned to that list automatically

### Managing Leads

**Delete Individual Leads:**
- In the leads table, click **Delete** next to any lead
- Confirm the deletion

**Bulk Delete Leads:**
- Click the checkbox next to each lead you want to delete
- Or use the checkbox in the header to **Select All** leads on the current page
- A floating action bar will appear at the bottom showing "{X} leads selected"
- Click **Delete Selected** button
- Confirm the deletion
- All selected leads will be deleted at once

**Delete a List:**
- Hover over the list tab
- Click the **✕** button that appears
- Confirm deletion
- *Note: Leads in the list are NOT deleted, just moved to "Uncategorized"*

### Creating Campaigns with Specific Lists

1. Go to **Campaigns** → **+ Create**
2. Fill in campaign details
3. In the **Select Leads** section:
   - Use the **Filter by List** dropdown
   - Choose "All Lists", "Uncategorized", or a specific list
   - The lead count updates automatically
4. Select leads (or use "Select All")
5. Create campaign

---

## UI Features

### Leads Page Tabs

- **All Leads**: Shows all your leads across all lists
- **Uncategorized**: Shows leads not assigned to any list
- **[Your Lists]**: Shows leads in specific lists
- **Hover to Delete**: Hover over any list tab to see a delete button

### Visual Indicators

- Lead count badge on each tab: `(10)`
- List name shown in leads table
- List badge shown when selecting leads in campaign creation

---

## Database Schema

### `lead_lists` Table

| Column        | Type      | Description                    |
|---------------|-----------|--------------------------------|
| `id`          | UUID      | Primary key                    |
| `user_id`     | UUID      | References auth.users          |
| `name`        | TEXT      | List name (e.g., "Q1 Leads")   |
| `description` | TEXT      | Optional description           |
| `created_at`  | TIMESTAMP | Creation timestamp             |
| `updated_at`  | TIMESTAMP | Last update timestamp          |

### `leads` Table (Updated)

- **New Column**: `list_id` (UUID, nullable, references `lead_lists.id`)
- **Behavior**: If a list is deleted, `list_id` is set to `NULL` (not deleted)

---

## Example Workflows

### Workflow 1: Organize by Campaign

1. Create lists: "Q1 Campaign", "Q2 Campaign", "Q3 Campaign"
2. Upload different CSVs to each list
3. When creating a campaign, filter by the relevant list
4. Run targeted outreach per quarter

### Workflow 2: Organize by Priority

1. Create lists: "Hot Leads", "Warm Leads", "Cold Leads"
2. Upload your master CSV to "Cold Leads"
3. After hot lead detection, manually move contacts to "Hot Leads"
4. Create campaigns with different messaging for each priority level

### Workflow 3: Organize by Industry

1. Create lists: "SaaS Leads", "E-commerce Leads", "Agencies"
2. Upload industry-specific CSVs
3. Craft industry-specific email templates
4. Run parallel campaigns for each vertical

---

## API Endpoints

### Create Lead List
```
POST /api/lead-lists/create
Body: { "name": "Q1 Leads", "description": "Optional description" }
Returns: { "list": { id, name, description, ... } }
```

---

## Troubleshooting

**Q: I don't see the "New List" button**
- Make sure you ran the SQL migration
- Refresh the page
- Check browser console for errors

**Q: Leads aren't showing in the list after upload**
- Make sure you're on the correct list tab when uploading
- Refresh the page to see updated counts

**Q: Can I move leads between lists?**
- Currently, you need to re-upload the CSV to a different list
- In a future update, we'll add drag-and-drop list management

**Q: What happens if I delete a list?**
- The list is deleted
- Leads in that list are NOT deleted
- Leads will appear in "Uncategorized" tab

---

## Next Steps

After setting up Lead Lists, you can:
1. ✅ Organize your existing leads into lists
2. ✅ Create targeted campaigns per list
3. ✅ Upload new lists for different outreach strategies
4. 🚀 Monitor campaign performance per list (coming soon)
5. 🚀 AI-powered list recommendations (coming soon)

---

## Technical Notes

- **RLS Enabled**: All lead lists are user-scoped via Supabase RLS
- **Soft Delete on List**: When a list is deleted, leads keep their data
- **Cascade Protection**: Deleting a list doesn't delete leads (set to NULL)
- **Indexes**: Optimized queries with `idx_lead_lists_user_id` and `idx_leads_list_id`

---

## Files Modified/Created

**New Files:**
- `supabase-lead-lists.sql` - Database migration
- `/src/app/leads/DeleteLeadButton.tsx` - Delete single lead component
- `/src/app/leads/BulkDeleteButton.tsx` - Bulk delete floating action bar
- `/src/app/leads/LeadsTable.tsx` - Table with checkbox selection
- `/src/app/leads/CreateListButton.tsx` - Create list modal
- `/src/app/leads/LeadListSelector.tsx` - List tabs component
- `/src/app/api/lead-lists/create/route.ts` - Create list API

**Updated Files:**
- `/src/app/leads/page.tsx` - Full redesign with list support
- `/src/app/leads/UploadForm.tsx` - Assigns leads to selected list
- `/src/app/campaigns/new/page.tsx` - Fetches lead lists
- `/src/app/campaigns/new/LeadSelector.tsx` - Filter leads by list

---

## Testing Checklist

- [ ] Run SQL migration in Supabase
- [ ] Create a new lead list
- [ ] Upload CSV to that list
- [ ] Verify leads appear in the list tab
- [ ] Delete a single lead
- [ ] Select multiple leads with checkboxes
- [ ] Use "Select All" checkbox in header
- [ ] Click "Delete Selected" and confirm bulk deletion
- [ ] Create a campaign and filter by list
- [ ] Delete a lead list
- [ ] Verify leads move to "Uncategorized"

---

**You're all set!** 🎉 Your leads are now organized and ready for targeted outreach.
