-- Add OAuth fields to existing email_connections table
-- This allows the table to support BOTH Gmail OAuth AND Outlook SMTP

-- Make SMTP fields nullable (since Gmail won't use them)
ALTER TABLE email_connections ALTER COLUMN smtp_host DROP NOT NULL;
ALTER TABLE email_connections ALTER COLUMN smtp_port DROP NOT NULL;
ALTER TABLE email_connections ALTER COLUMN smtp_username DROP NOT NULL;
ALTER TABLE email_connections ALTER COLUMN smtp_password DROP NOT NULL;
ALTER TABLE email_connections ALTER COLUMN from_email DROP NOT NULL;

-- Add OAuth fields for Gmail
ALTER TABLE email_connections ADD COLUMN IF NOT EXISTS access_token TEXT;
ALTER TABLE email_connections ADD COLUMN IF NOT EXISTS refresh_token TEXT;
ALTER TABLE email_connections ADD COLUMN IF NOT EXISTS expiry_date TIMESTAMPTZ;
ALTER TABLE email_connections ADD COLUMN IF NOT EXISTS email TEXT;

-- Update constraint to include gmail
ALTER TABLE email_connections DROP CONSTRAINT IF EXISTS email_connections_provider_check;
ALTER TABLE email_connections ADD CONSTRAINT email_connections_provider_check 
  CHECK (provider IN ('gmail', 'outlook'));

-- Add check: SMTP fields required for outlook, OAuth fields required for gmail
ALTER TABLE email_connections ADD CONSTRAINT email_connections_fields_check
  CHECK (
    (provider = 'outlook' AND smtp_host IS NOT NULL AND smtp_port IS NOT NULL AND smtp_username IS NOT NULL AND smtp_password IS NOT NULL)
    OR
    (provider = 'gmail' AND access_token IS NOT NULL AND email IS NOT NULL)
  );
