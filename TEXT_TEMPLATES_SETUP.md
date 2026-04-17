# Text Templates Feature - Setup Guide

## What's New

You can now use premade text templates in the Schedule Text feature, similar to how email templates work! You can:

- **Create and save text templates** for commonly used messages
- **Select from a dropdown** of your saved templates when scheduling a text
- **Edit templates directly** from the template manager
- **Write custom text** - you can still write one-off messages without using a template

## Setup Steps

### 1. Run Database Migration

Open your Supabase SQL Editor and run the migration script:

```bash
add-text-templates.sql
```

This creates the `text_templates` table with proper RLS policies.

### 2. Test the Feature

1. **Create a template:**
   - Click "Schedule Text" on any lead
   - Click "+ Manage Templates"
   - Enter a template name (e.g., "Follow Up")
   - Enter your message content
   - Click "Save Template"

2. **Use a template:**
   - Click "Schedule Text" on any lead
   - Select a template from the dropdown
   - The message will auto-populate in the textarea
   - You can edit it if needed
   - Schedule or send the text

3. **Write custom text:**
   - Click "Schedule Text" on any lead
   - Leave the template dropdown on "Choose a template or write your own..."
   - Type your message directly in the textarea
   - Schedule or send the text

## Features

- ✅ **Template Manager**: Create, edit, and delete text templates
- ✅ **Template Dropdown**: Quick access to all your saved templates
- ✅ **Character Counter**: See SMS length and segment count
- ✅ **Custom Text**: Still write one-off messages without using templates
- ✅ **Auto-populate**: Selected template fills the textarea automatically
- ✅ **Editable**: Modify template text before sending

## Files Created/Modified

### New Files:
- `/src/app/api/text-templates/route.ts` - API routes for template CRUD
- `/add-text-templates.sql` - Database migration script
- `/TEXT_TEMPLATES_SETUP.md` - This setup guide

### Modified Files:
- `/src/app/dashboard/CRMTable.tsx` - Added text template UI and logic

## Notes

- Templates are user-specific (each user has their own templates)
- Templates are stored in the database and persist across sessions
- You can have unlimited templates
- The textarea still works exactly as before - templates are optional

Enjoy your new text templates feature! 📱
