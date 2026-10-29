-- Saved phone-book extras (lender emails/phones are merged live from the lender list).
-- Safe to run more than once.

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS phone_book JSONB DEFAULT '{"extras":[],"hidden":[]}'::jsonb;

NOTIFY pgrst, 'reload schema';
