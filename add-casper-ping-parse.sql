-- Ping when AI finishes reading bank statements or parsing a lead sheet.
-- Off unless you turn it on in Agent → Ping. Safe to run more than once.

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS casper_ping_parse BOOLEAN DEFAULT FALSE;

NOTIFY pgrst, 'reload schema';
