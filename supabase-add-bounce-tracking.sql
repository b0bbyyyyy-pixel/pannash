-- Add bounce tracking to campaign_leads
-- This tracks emails that failed to deliver (invalid address, bounced, etc.)

-- Add bounced_at column to campaign_leads
ALTER TABLE campaign_leads 
ADD COLUMN IF NOT EXISTS bounced_at TIMESTAMPTZ;

-- Add bounce_reason column to store why it bounced
ALTER TABLE campaign_leads 
ADD COLUMN IF NOT EXISTS bounce_reason TEXT;

-- Add error_message column for general errors
ALTER TABLE campaign_leads 
ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Update status column to allow 'bounced' value
-- (This is just documentation, the column already allows any text)
COMMENT ON COLUMN campaign_leads.status IS 'Status: pending, queued, sending, sent, opened, clicked, replied, bounced, failed';

-- Create index for faster bounce queries
CREATE INDEX IF NOT EXISTS idx_campaign_leads_bounced_at ON campaign_leads(bounced_at) WHERE bounced_at IS NOT NULL;

-- Done! Now we can track bounced emails
