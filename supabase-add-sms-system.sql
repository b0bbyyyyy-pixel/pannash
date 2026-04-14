-- ============================================
-- SMS CAMPAIGN SYSTEM SCHEMA
-- ============================================

-- 1. Add campaign type column
ALTER TABLE campaigns
ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'email' CHECK (type IN ('email', 'sms'));

ALTER TABLE campaigns
ADD COLUMN IF NOT EXISTS sms_body TEXT;

ALTER TABLE campaigns
ADD COLUMN IF NOT EXISTS ai_directive TEXT;

COMMENT ON COLUMN campaigns.type IS 'Campaign type: email or sms';
COMMENT ON COLUMN campaigns.sms_body IS 'SMS message template with variables like [Name], [Company], [Phone]';
COMMENT ON COLUMN campaigns.ai_directive IS 'Instructions for AI when replying to SMS responses';

-- 2. Create phone_connections table for Twilio
CREATE TABLE IF NOT EXISTS phone_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'twilio',
  account_sid TEXT NOT NULL,
  auth_token TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE phone_connections ENABLE ROW LEVEL SECURITY;

-- RLS Policies for phone_connections
CREATE POLICY "phone_connections_select" ON phone_connections
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "phone_connections_insert" ON phone_connections
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "phone_connections_update" ON phone_connections
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "phone_connections_delete" ON phone_connections
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- 3. Create sms_queue table (mirrors email_queue)
CREATE TABLE IF NOT EXISTS sms_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  campaign_lead_id UUID NOT NULL REFERENCES campaign_leads(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  sms_body TEXT NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
  twilio_sid TEXT,
  last_error TEXT,
  attempts INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE sms_queue ENABLE ROW LEVEL SECURITY;

-- RLS Policies for sms_queue
CREATE POLICY "sms_queue_select" ON sms_queue
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM campaigns 
      WHERE campaigns.id = sms_queue.campaign_id 
      AND campaigns.user_id = auth.uid()
    )
  );

CREATE POLICY "sms_queue_manage" ON sms_queue
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM campaigns 
      WHERE campaigns.id = sms_queue.campaign_id 
      AND campaigns.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM campaigns 
      WHERE campaigns.id = sms_queue.campaign_id 
      AND campaigns.user_id = auth.uid()
    )
  );

-- 4. Create sms_messages table (for conversation history)
CREATE TABLE IF NOT EXISTS sms_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_lead_id UUID NOT NULL REFERENCES campaign_leads(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('outbound', 'inbound')),
  body TEXT NOT NULL,
  from_number TEXT NOT NULL,
  to_number TEXT NOT NULL,
  twilio_sid TEXT,
  ai_generated BOOLEAN DEFAULT FALSE,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE sms_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for sms_messages
CREATE POLICY "sms_messages_select" ON sms_messages
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM campaign_leads cl
      JOIN campaigns c ON c.id = cl.campaign_id
      WHERE cl.id = sms_messages.campaign_lead_id
      AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "sms_messages_insert" ON sms_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM campaign_leads cl
      JOIN campaigns c ON c.id = cl.campaign_id
      WHERE cl.id = sms_messages.campaign_lead_id
      AND c.user_id = auth.uid()
    )
  );

-- Allow anon inserts for Twilio webhook
CREATE POLICY "sms_messages_webhook_insert" ON sms_messages
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- 5. Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_campaigns_type ON campaigns(type);
CREATE INDEX IF NOT EXISTS idx_sms_queue_scheduled ON sms_queue(scheduled_for) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_sms_queue_campaign ON sms_queue(campaign_id);
CREATE INDEX IF NOT EXISTS idx_sms_messages_campaign_lead ON sms_messages(campaign_lead_id);
CREATE INDEX IF NOT EXISTS idx_sms_messages_direction ON sms_messages(direction);

-- 6. Update automation_settings to include SMS preferences
ALTER TABLE automation_settings
ADD COLUMN IF NOT EXISTS sms_frequency TEXT DEFAULT '5-10';

ALTER TABLE automation_settings
ADD COLUMN IF NOT EXISTS sms_daily_limit INTEGER DEFAULT 50;

COMMENT ON COLUMN automation_settings.sms_frequency IS 'SMS frequency: 5-10 means 5-10 minutes between SMS (moderate/recommended)';
COMMENT ON COLUMN automation_settings.sms_daily_limit IS 'Max SMS per day across all campaigns';

-- Update email_frequency default to moderate (5-10 min) if it exists
ALTER TABLE automation_settings
ALTER COLUMN email_frequency SET DEFAULT '5-10';

COMMENT ON COLUMN automation_settings.email_frequency IS 'Email frequency: 5-10 means 5-10 minutes between emails (moderate/recommended)';

-- Verify tables were created
SELECT 
  table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_name IN ('phone_connections', 'sms_queue', 'sms_messages')
ORDER BY table_name, ordinal_position;
