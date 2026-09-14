-- Google OAuth connection storage
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS google_connections (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  google_email  TEXT,
  access_token  TEXT        NOT NULL,
  refresh_token TEXT,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id)
);

-- Only the owning user can see / edit their own row
ALTER TABLE google_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_all" ON google_connections
  FOR ALL USING (auth.uid() = user_id);

NOTIFY pgrst, 'reload schema';
