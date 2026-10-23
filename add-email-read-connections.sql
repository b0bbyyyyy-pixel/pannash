-- Separate Gmail read login (Inbox / Sent). Does not touch send tokens.
-- Run once in Supabase → SQL Editor.

CREATE TABLE IF NOT EXISTS email_read_connections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  from_email TEXT,
  email_address TEXT,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expiry_date TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

ALTER TABLE email_read_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own email_read_connections" ON email_read_connections;
CREATE POLICY "Users view own email_read_connections"
  ON email_read_connections FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own email_read_connections" ON email_read_connections;
CREATE POLICY "Users insert own email_read_connections"
  ON email_read_connections FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own email_read_connections" ON email_read_connections;
CREATE POLICY "Users update own email_read_connections"
  ON email_read_connections FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own email_read_connections" ON email_read_connections;
CREATE POLICY "Users delete own email_read_connections"
  ON email_read_connections FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_email_read_connections_user
  ON email_read_connections(user_id);

NOTIFY pgrst, 'reload schema';
