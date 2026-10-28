-- Ping your cell when a lead texts the inbox. Off unless you turn it on
-- on Messages or in Agent → Ping. Safe to run more than once.

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS casper_ping_inbox BOOLEAN DEFAULT FALSE;

NOTIFY pgrst, 'reload schema';
