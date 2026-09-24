-- Master switch for Casper AI (Inbox toggle). Off = red, On = black.
-- Run this in the Supabase SQL Editor.

ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS casper_enabled BOOLEAN NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
