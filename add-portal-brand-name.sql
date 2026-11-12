-- Display name shown on the merchant portal and in portal emails. Idempotent. Run in the Supabase SQL editor.

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS portal_brand_name text;
