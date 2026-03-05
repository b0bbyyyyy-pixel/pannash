-- ============================================
-- Fix Campaigns Table - Make Email Fields Nullable
-- ============================================
-- SMS campaigns don't have subjects or email bodies,
-- so these columns should be nullable

-- Make subject nullable
ALTER TABLE campaigns
ALTER COLUMN subject DROP NOT NULL;

-- Make email_body nullable
ALTER TABLE campaigns
ALTER COLUMN email_body DROP NOT NULL;

-- Verify the changes
SELECT 
  column_name, 
  is_nullable, 
  data_type
FROM information_schema.columns
WHERE table_name = 'campaigns'
  AND column_name IN ('subject', 'email_body', 'sms_body', 'ai_directive', 'type');
