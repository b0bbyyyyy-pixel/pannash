-- Add missing columns to email_queue table

-- Add campaign_lead_id column (to link to campaign_leads table)
ALTER TABLE email_queue 
ADD COLUMN IF NOT EXISTS campaign_lead_id UUID REFERENCES campaign_leads(id) ON DELETE CASCADE;

-- Add email_subject and email_body for personalized emails
ALTER TABLE email_queue 
ADD COLUMN IF NOT EXISTS email_subject TEXT;

ALTER TABLE email_queue 
ADD COLUMN IF NOT EXISTS email_body TEXT;

-- Create index for campaign_lead_id
CREATE INDEX IF NOT EXISTS idx_email_queue_campaign_lead_id ON email_queue(campaign_lead_id);

-- Update RLS policy to include new column (optional, but good practice)
COMMENT ON COLUMN email_queue.campaign_lead_id IS 'References the campaign_lead record for tracking';
COMMENT ON COLUMN email_queue.email_subject IS 'Personalized email subject line';
COMMENT ON COLUMN email_queue.email_body IS 'Personalized email body content';
