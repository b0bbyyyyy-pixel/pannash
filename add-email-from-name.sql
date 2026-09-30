-- Display name used in outbound From: "Name" <address>
-- Run once in Supabase → SQL Editor.

ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS email_from_name TEXT;

NOTIFY pgrst, 'reload schema';
