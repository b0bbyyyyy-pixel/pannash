-- Fix existing leads to use the correct month_key format that matches monthly_dashboards
-- This assigns all leads to the user's FIRST (oldest) monthly dashboard tab

UPDATE leads
SET month_key = (
  SELECT month_key 
  FROM monthly_dashboards 
  WHERE monthly_dashboards.user_id = leads.user_id
  ORDER BY created_at ASC
  LIMIT 1
)
WHERE month_key ~ '^[0-9]{4}-[0-9]{2}$' -- Only update leads with old YYYY-MM format
  OR month_key IS NULL;

-- Verify the update
SELECT 
  COUNT(*) as total_leads,
  COUNT(DISTINCT month_key) as unique_month_keys
FROM leads;
