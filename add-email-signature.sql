-- Email signature appended to every outbound email
-- Run this in the Supabase SQL Editor

ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS email_signature TEXT;

NOTIFY pgrst, 'reload schema';
