-- Add next_email_at column to campaign_leads for tracking auto-loop timing

ALTER TABLE campaign_leads 
ADD COLUMN IF NOT EXISTS next_email_at TIMESTAMP WITH TIME ZONE;

-- Create index for efficient querying of leads ready to be re-contacted
CREATE INDEX IF NOT EXISTS idx_campaign_leads_next_email_at ON campaign_leads(next_email_at);

-- Add comment explaining the column
COMMENT ON COLUMN campaign_leads.next_email_at IS 'Timestamp for when this lead should be contacted again in the auto-loop (e.g., 14 days after initial send)';

-- Add loop_count to track how many times this lead has been contacted
ALTER TABLE campaign_leads 
ADD COLUMN IF NOT EXISTS loop_count INTEGER DEFAULT 0;

COMMENT ON COLUMN campaign_leads.loop_count IS 'Number of times this lead has been sent an email in this campaign (initial + loops)';
