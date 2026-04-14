-- ============================================
-- SMS AI REPLY CONTROLS
-- ============================================

-- 1. Add AI enabled toggle to campaigns (per-campaign control)
ALTER TABLE campaigns
ADD COLUMN IF NOT EXISTS ai_replies_enabled BOOLEAN DEFAULT true;

COMMENT ON COLUMN campaigns.ai_replies_enabled IS 'Whether AI should auto-reply to SMS responses (true = auto, false = manual only)';

-- 2. Add AI response delay to automation_settings (global setting)
ALTER TABLE automation_settings
ADD COLUMN IF NOT EXISTS ai_response_delay_min INTEGER DEFAULT 2;

ALTER TABLE automation_settings
ADD COLUMN IF NOT EXISTS ai_response_delay_max INTEGER DEFAULT 8;

COMMENT ON COLUMN automation_settings.ai_response_delay_min IS 'Minimum minutes to wait before AI replies to SMS (human-like delay)';
COMMENT ON COLUMN automation_settings.ai_response_delay_max IS 'Maximum minutes to wait before AI replies to SMS (randomized delay)';

-- Verify columns were added
SELECT 
  column_name,
  data_type,
  column_default
FROM information_schema.columns
WHERE table_name = 'campaigns' 
  AND column_name = 'ai_replies_enabled'
UNION ALL
SELECT 
  column_name,
  data_type,
  column_default
FROM information_schema.columns
WHERE table_name = 'automation_settings' 
  AND column_name IN ('ai_response_delay_min', 'ai_response_delay_max')
ORDER BY column_name;
