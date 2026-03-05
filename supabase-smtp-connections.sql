-- Drop the old OAuth-based table if it exists
DROP TABLE IF EXISTS email_connections CASCADE;

-- Create email_connections table for SMTP credentials
CREATE TABLE email_connections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('outlook', 'gmail')),
  smtp_host TEXT NOT NULL,
  smtp_port INTEGER NOT NULL,
  smtp_username TEXT NOT NULL,
  smtp_password TEXT NOT NULL,
  from_email TEXT NOT NULL,
  from_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, provider)
);

-- Enable RLS
ALTER TABLE email_connections ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own SMTP connections
CREATE POLICY "Users can view own SMTP connections"
  ON email_connections
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own SMTP connections
CREATE POLICY "Users can insert own SMTP connections"
  ON email_connections
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own SMTP connections
CREATE POLICY "Users can update own SMTP connections"
  ON email_connections
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Policy: Users can delete their own SMTP connections
CREATE POLICY "Users can delete own SMTP connections"
  ON email_connections
  FOR DELETE
  USING (auth.uid() = user_id);

-- Index for faster lookups
CREATE INDEX idx_email_connections_user_id ON email_connections(user_id);
