-- Create table for dashboard configuration (stages and stats)
CREATE TABLE IF NOT EXISTS dashboard_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  config_type TEXT NOT NULL, -- 'stages' or 'stats'
  config_data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, config_type)
);

-- Enable RLS
ALTER TABLE dashboard_config ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own dashboard config"
  ON dashboard_config FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own dashboard config"
  ON dashboard_config FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own dashboard config"
  ON dashboard_config FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own dashboard config"
  ON dashboard_config FOR DELETE
  USING (auth.uid() = user_id);

-- Create index
CREATE INDEX IF NOT EXISTS idx_dashboard_config_user_type ON dashboard_config(user_id, config_type);

COMMENT ON TABLE dashboard_config IS 'User-specific configuration for dashboard stages and stats';
COMMENT ON COLUMN dashboard_config.config_data IS 'JSONB containing stages array or stats array';

-- Insert default configurations for existing users
INSERT INTO dashboard_config (user_id, config_type, config_data)
SELECT 
  id as user_id,
  'stages',
  '[
    {"value": "Killed In Final", "color": "bg-[#e5e5e5] text-[#4a4a4a]"},
    {"value": "All Declined/Final", "color": "bg-[#d5e5f0] text-[#2a4a5a]"},
    {"value": "Offers/Follow up", "color": "bg-[#e5d5e8] text-[#4a3a5a]"},
    {"value": "Proposal Sent", "color": "bg-[#f0d5a8] text-[#6b4a2a]"},
    {"value": "Contracts Out", "color": "bg-[#f0c5c5] text-[#8a2a2a]"}
  ]'::jsonb
FROM auth.users
ON CONFLICT (user_id, config_type) DO NOTHING;

INSERT INTO dashboard_config (user_id, config_type, config_data)
SELECT 
  id as user_id,
  'stats',
  '[
    {"key": "activeLeads", "label": "Active Leads", "color": "text-[#1a1a1a]"},
    {"key": "contractsOut", "label": "Contracts Out", "color": "text-[#8a2a2a]", "stage": "Contracts Out"},
    {"key": "proposalsOut", "label": "Proposals Out", "color": "text-[#d17a3f]", "stage": "Proposal Sent"},
    {"key": "totalValue", "label": "Total Value", "color": "text-[#1a1a1a]", "format": "currency"},
    {"key": "activeTimers", "label": "Active Timers", "color": "text-[#5a7fc7]"}
  ]'::jsonb
FROM auth.users
ON CONFLICT (user_id, config_type) DO NOTHING;
