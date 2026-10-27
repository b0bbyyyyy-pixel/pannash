-- add-sms-language.sql — safe to re-run
-- Stores the lead's SMS language and per-message English gloss / original draft.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS sms_language TEXT;

ALTER TABLE inbox_messages
  ADD COLUMN IF NOT EXISTS body_original TEXT,
  ADD COLUMN IF NOT EXISTS body_en TEXT,
  ADD COLUMN IF NOT EXISTS detected_lang TEXT;

NOTIFY pgrst, 'reload schema';
