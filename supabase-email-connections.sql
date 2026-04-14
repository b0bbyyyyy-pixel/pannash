-- Create email_connections table for storing OAuth tokens
CREATE TABLE IF NOT EXISTS email_connections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('gmail', 'outlook')),
  email_address TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, provider)
);

-- Enable RLS
ALTER TABLE email_connections ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own email connections
CREATE POLICY "Users can view own email connections"
  ON email_connections
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own email connections
CREATE POLICY "Users can insert own email connections"
  ON email_connections
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own email connections
CREATE POLICY "Users can update own email connections"
  ON email_connections
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Policy: Users can delete their own email connections
CREATE POLICY "Users can delete own email connections"
  ON email_connections
  FOR DELETE
  USING (auth.uid() = user_id);

-- Index for faster lookups
CREATE INDEX idx_email_connections_user_id ON email_connections(user_id);
