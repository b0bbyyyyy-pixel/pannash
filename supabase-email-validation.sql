-- Add email validation fields to leads table
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS email_status TEXT DEFAULT 'unchecked',
ADD COLUMN IF NOT EXISTS email_validation_notes TEXT;

-- Possible email_status values:
-- 'unchecked' - not yet validated
-- 'valid' - passed validation
-- 'invalid' - failed validation (bad format, blocked domain, etc.)
-- 'missing' - no email address
-- 'ai_suggested' - AI has suggested an email

-- Create blocked_domains table for user-defined domain blocklist
CREATE TABLE IF NOT EXISTS blocked_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create unique constraint to prevent duplicate domains per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_blocked_domains_user_domain 
  ON blocked_domains(user_id, domain);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_blocked_domains_user_id ON blocked_domains(user_id);

-- RLS for blocked_domains
ALTER TABLE blocked_domains ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own blocked domains" ON blocked_domains;
CREATE POLICY "Users can view their own blocked domains"
  ON blocked_domains FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own blocked domains" ON blocked_domains;
CREATE POLICY "Users can insert their own blocked domains"
  ON blocked_domains FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own blocked domains" ON blocked_domains;
CREATE POLICY "Users can delete their own blocked domains"
  ON blocked_domains FOR DELETE
  USING (auth.uid() = user_id);

-- Create index for email_status for faster filtering
CREATE INDEX IF NOT EXISTS idx_leads_email_status ON leads(email_status);
