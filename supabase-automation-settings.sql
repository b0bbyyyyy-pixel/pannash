-- Create automation_settings table to store user's Brains configuration

CREATE TABLE IF NOT EXISTS automation_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Email sending settings
  daily_limit INTEGER DEFAULT 75,
  email_frequency TEXT DEFAULT '2-5', -- Options: '0.5-2', '2-5', '5-10', '10-20', '20-40', '40-60'
  business_hours_only BOOLEAN DEFAULT true,
  
  -- Loop settings
  loop_after_days INTEGER DEFAULT 14, -- Days before re-contacting a lead
  
  -- Follow-up settings
  followup_enabled BOOLEAN DEFAULT true,
  followup_timing TEXT DEFAULT '3_days', -- Options: '1_day', '3_days', '1_week', '2_weeks', '30_days'
  
  -- AI settings
  ai_personalization INTEGER DEFAULT 50, -- 0-100 percentage
  
  -- Auto-start settings
  auto_start_daily BOOLEAN DEFAULT true,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(user_id)
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_automation_settings_user_id ON automation_settings(user_id);

-- RLS Policies
ALTER TABLE automation_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own settings"
  ON automation_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own settings"
  ON automation_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own settings"
  ON automation_settings FOR UPDATE
  USING (auth.uid() = user_id);

-- Function to create default settings for new users
CREATE OR REPLACE FUNCTION create_default_automation_settings()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO automation_settings (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-create settings when a new user signs up
DROP TRIGGER IF EXISTS on_auth_user_created_automation_settings ON auth.users;
CREATE TRIGGER on_auth_user_created_automation_settings
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION create_default_automation_settings();

-- Add comment
COMMENT ON TABLE automation_settings IS 'Stores user automation preferences from the Brains page';
