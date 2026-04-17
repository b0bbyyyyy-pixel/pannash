-- Add scheduled email columns to leads table
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS scheduled_email_template_id UUID,
ADD COLUMN IF NOT EXISTS scheduled_email_time TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS scheduled_email_frequency TEXT DEFAULT 'once',
ADD COLUMN IF NOT EXISTS last_scheduled_email_sent TIMESTAMP WITH TIME ZONE;

-- Create index for scheduled emails
CREATE INDEX IF NOT EXISTS idx_leads_scheduled_email_time ON leads(scheduled_email_time) WHERE scheduled_email_time IS NOT NULL;

-- Create email_templates table if it doesn't exist
CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on email_templates
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;

-- RLS Policies for email_templates
DROP POLICY IF EXISTS "Users can view own email templates" ON email_templates;
DROP POLICY IF EXISTS "Users can insert own email templates" ON email_templates;
DROP POLICY IF EXISTS "Users can update own email templates" ON email_templates;
DROP POLICY IF EXISTS "Users can delete own email templates" ON email_templates;

CREATE POLICY "Users can view own email templates"
  ON email_templates FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own email templates"
  ON email_templates FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own email templates"
  ON email_templates FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own email templates"
  ON email_templates FOR DELETE
  USING (auth.uid() = user_id);

-- Create indexes for email_templates
CREATE INDEX IF NOT EXISTS idx_email_templates_user_id ON email_templates(user_id);
