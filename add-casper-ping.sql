-- Casper Ping: text Robert's personal cell and keep a two-way thread.
-- Run in the Supabase SQL Editor.

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS casper_ping_enabled BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS casper_ping_phone TEXT;

CREATE TABLE IF NOT EXISTS casper_ping_messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  direction  TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  body       TEXT NOT NULL,
  kind       TEXT NOT NULL DEFAULT 'chat'
               CHECK (kind IN ('chat', 'alert', 'calendar', 'needs_human', 'docs', 'test')),
  status     TEXT NOT NULL DEFAULT 'sent',
  twilio_sid TEXT,
  error      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS casper_ping_messages_user_created
  ON casper_ping_messages (user_id, created_at DESC);

ALTER TABLE casper_ping_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own casper_ping_messages" ON casper_ping_messages;
CREATE POLICY "Users manage own casper_ping_messages"
  ON casper_ping_messages FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

NOTIFY pgrst, 'reload schema';
