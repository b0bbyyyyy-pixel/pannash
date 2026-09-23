-- Named SMS template sets (pick which set to use when running a drip).
-- Run this in the Supabase SQL Editor.

ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS sms_template_packs JSONB DEFAULT '[]'::jsonb;

NOTIFY pgrst, 'reload schema';
