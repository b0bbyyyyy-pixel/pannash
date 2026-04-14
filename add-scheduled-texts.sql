-- Add columns to leads table for scheduled text messages
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS scheduled_text_content TEXT,
ADD COLUMN IF NOT EXISTS scheduled_text_time TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS scheduled_text_frequency TEXT DEFAULT 'once',
ADD COLUMN IF NOT EXISTS last_scheduled_text_sent TIMESTAMP WITH TIME ZONE;

-- scheduled_text_content: The text message to send
-- scheduled_text_time: When to send the first message
-- scheduled_text_frequency: How often to repeat (once, daily, every2days, weekly, etc.)
-- last_scheduled_text_sent: Track when last sent for recurring messages

-- Add index for faster queries on scheduled texts
CREATE INDEX IF NOT EXISTS idx_leads_scheduled_text_time ON leads(scheduled_text_time) WHERE scheduled_text_time IS NOT NULL;
