-- Create table for email and text templates
CREATE TABLE IF NOT EXISTS message_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'email' or 'text'
  name TEXT NOT NULL,
  subject TEXT, -- For emails only
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own templates"
  ON message_templates FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own templates"
  ON message_templates FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own templates"
  ON message_templates FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own templates"
  ON message_templates FOR DELETE
  USING (auth.uid() = user_id);

-- Create index
CREATE INDEX IF NOT EXISTS idx_templates_user_type ON message_templates(user_id, type);

-- Add template reference columns to leads table
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS email_template_id UUID REFERENCES message_templates(id) ON DELETE SET NULL;

ALTER TABLE leads
ADD COLUMN IF NOT EXISTS text_template_id UUID REFERENCES message_templates(id) ON DELETE SET NULL;

COMMENT ON TABLE message_templates IS 'User-created email and text message templates for automation';
COMMENT ON COLUMN leads.email_template_id IS 'Template to use for auto emails';
COMMENT ON COLUMN leads.text_template_id IS 'Template to use for auto texts';

-- Insert default templates for existing users
INSERT INTO message_templates (user_id, type, name, subject, body)
SELECT 
  id as user_id,
  'email',
  'Follow Up',
  'Checking in',
  'Hi {{name}},

Just wanted to check in and see if you had any questions about our proposal.

Best regards'
FROM auth.users
ON CONFLICT DO NOTHING;

INSERT INTO message_templates (user_id, type, name, body)
SELECT 
  id as user_id,
  'text',
  'Quick Check-in',
  'Hi {{name}}, just checking in on the {{company}} opportunity. Any questions?'
FROM auth.users
ON CONFLICT DO NOTHING;
