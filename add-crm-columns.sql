-- Add CRM columns to leads table for personal mini-CRM workflow

-- Stage tracking
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS stage TEXT DEFAULT 'Offers/Follow up';

-- Timer functionality
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS timer_type TEXT DEFAULT 'No Timer';

ALTER TABLE leads
ADD COLUMN IF NOT EXISTS timer_end_date TIMESTAMPTZ;

-- Auto outreach settings
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS auto_email_frequency TEXT DEFAULT 'Off';

ALTER TABLE leads
ADD COLUMN IF NOT EXISTS auto_text_frequency TEXT DEFAULT 'Off';

-- Additional business fields
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS value INTEGER DEFAULT 0;

ALTER TABLE leads
ADD COLUMN IF NOT EXISTS lead_source TEXT;

ALTER TABLE leads
ADD COLUMN IF NOT EXISTS last_contact TIMESTAMPTZ;

ALTER TABLE leads
ADD COLUMN IF NOT EXISTS offers TEXT;

-- Month tracking for separating leads by month
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS month_key TEXT DEFAULT TO_CHAR(NOW(), 'YYYY-MM');

-- Create index for faster queries on stage
CREATE INDEX IF NOT EXISTS idx_leads_stage ON leads(stage);

-- Create index for timer queries
CREATE INDEX IF NOT EXISTS idx_leads_timer_end_date ON leads(timer_end_date) WHERE timer_end_date IS NOT NULL;

-- Create index for month filtering
CREATE INDEX IF NOT EXISTS idx_leads_month_key ON leads(month_key);

COMMENT ON COLUMN leads.stage IS 'Lead stage: Killed In Final, All Declined/Final, Offers/Follow up, Proposal Sent, Contracts Out';
COMMENT ON COLUMN leads.timer_type IS 'Timer type: 15 Day Countdown, 30 Day Countdown, 60 Day Countdown, No Timer';
COMMENT ON COLUMN leads.auto_email_frequency IS 'Auto email frequency: Off, Everyday, Every Other Day, Every 30 Days';
COMMENT ON COLUMN leads.auto_text_frequency IS 'Auto text frequency: Off, Everyday, Every Other Day, Every 30 Days';
