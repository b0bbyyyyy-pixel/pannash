-- Per-company branded merchant portal origin. Idempotent. Run in the Supabase SQL editor.

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS portal_domain text;
