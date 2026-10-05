-- Lead-activity pings (apps / bank statements). Off unless you turn it on in Agent → Ping.
-- Safe to run more than once.

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS casper_ping_activity BOOLEAN DEFAULT FALSE;

NOTIFY pgrst, 'reload schema';
