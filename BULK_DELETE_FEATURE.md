# Bulk Delete Feature - Quick Reference

## Overview
Added mass delete functionality to the Leads page, allowing you to select and delete multiple leads at once instead of one by one.

## How to Use

### 1. Select Leads
- Click the checkbox next to each lead you want to delete
- **Or** click the checkbox in the table header to select all leads at once

### 2. Delete Selected
- A floating action bar appears at the bottom: `{X} leads selected`
- Click **Delete Selected** button (red)
- Confirm the deletion in the popup
- All selected leads are deleted instantly

### 3. Cancel Selection
- Click **Cancel** button on the floating action bar
- Or manually uncheck leads to deselect them

## Visual Indicators

- ✅ **Selected leads**: Highlighted with light blue background (`bg-blue-50`)
- 📊 **Checkbox states**:
  - Empty: No leads selected
  - Checked: All leads selected
  - Indeterminate (dash): Some leads selected
- 🎯 **Floating action bar**: Fixed at bottom center when leads are selected

## Technical Details

### New Components

**`BulkDeleteButton.tsx`** (Client Component)
- Floating action bar that appears when leads are selected
- Shows count of selected leads
- Handles bulk deletion with confirmation
- "Delete Selected" and "Cancel" buttons

**`LeadsTable.tsx`** (Client Component)
- Extracted table rendering into separate component
- Manages checkbox state with `useState`
- Handles individual and "select all" checkbox logic
- Uses indeterminate state for "some selected" visual

### Server Actions

**`deleteMultipleLeads(formData: FormData)`**
- Accepts array of lead IDs via `formData.getAll('leadIds[]')`
- Deletes all leads in a single Supabase query using `.in('id', leadIds)`
- Revalidates `/leads` page after deletion

### Files Modified

1. `/src/app/leads/page.tsx`
   - Added `deleteMultipleLeads` server action
   - Replaced inline table with `<LeadsTable>` component
   
2. `/src/app/leads/LeadsTable.tsx` (NEW)
   - Client component managing selection state
   - Checkbox logic for individual and bulk selection
   
3. `/src/app/leads/BulkDeleteButton.tsx` (NEW)
   - Floating action bar component
   - Bulk delete handler with confirmation

4. `LEAD_LISTS_GUIDE.md`
   - Updated with bulk delete instructions

## Example Usage

### Scenario 1: Delete all old test leads
1. Go to **Leads** page
2. Click header checkbox to "Select All"
3. Click **Delete Selected**
4. Confirm → All leads deleted

### Scenario 2: Delete specific leads
1. Go to **Leads** page
2. Check boxes next to "Test Lead 1", "Test Lead 2", "Test Lead 3"
3. Click **Delete Selected** → Floating bar shows "3 leads selected"
4. Confirm → Only those 3 leads deleted

### Scenario 3: Accidentally selected wrong leads
1. Select leads with checkboxes
2. Notice you selected wrong ones
3. Click **Cancel** on floating action bar
4. Selection cleared, no leads deleted

## Benefits

- ⚡ **Faster cleanup**: Delete 10+ old leads in seconds instead of minutes
- 🎯 **Selective deletion**: Cherry-pick which leads to remove
- 🔄 **Bulk operations**: Select all with one click
- 🛡️ **Safety**: Confirmation dialog prevents accidental deletions
- 💡 **Visual feedback**: Clear selection state and floating UI

## Future Enhancements (Optional)

- [ ] Bulk actions: "Move to List", "Export Selected", "Add to Campaign"
- [ ] Pagination-aware "Select All" (select all across pages)
- [ ] Keyboard shortcuts (Shift+click for range select)
- [ ] Undo/restore deleted leads (soft delete)

---

**You're all set!** 🎉 Clean up your leads in bulk with ease.
