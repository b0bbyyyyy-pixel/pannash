-- OPTION 1: Assign ALL existing leads to your FIRST monthly dashboard tab
-- Run this if you want to keep your existing leads in the first tab

UPDATE leads
SET month_key = (
  SELECT month_key 
  FROM monthly_dashboards 
  WHERE monthly_dashboards.user_id = leads.user_id
  ORDER BY created_at ASC
  LIMIT 1
);

-- OPTION 2: Clear all existing leads' month_key so they don't show in ANY tab
-- Run this if you want to start fresh with empty tabs
-- (Uncomment the lines below if you want this option instead)

-- UPDATE leads
-- SET month_key = 'archived-' || TO_CHAR(NOW(), 'YYYY-MM')
-- WHERE TRUE;

-- Verify the fix
SELECT 
  l.name,
  l.month_key,
  m.custom_name as appears_in_tab
FROM leads l
LEFT JOIN monthly_dashboards m 
  ON l.month_key = m.month_key 
  AND l.user_id = m.user_id
ORDER BY m.created_at ASC, l.created_at DESC;
