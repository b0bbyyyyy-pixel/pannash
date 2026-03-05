-- Debug: Check month_key values in monthly_dashboards
SELECT 
  custom_name,
  month_key,
  created_at
FROM monthly_dashboards
ORDER BY created_at ASC;

-- Debug: Check month_key values in leads
SELECT 
  name,
  company,
  month_key,
  created_at
FROM leads
ORDER BY created_at DESC;

-- Show which leads match which dashboards
SELECT 
  l.name,
  l.month_key as lead_month_key,
  m.custom_name,
  m.month_key as dashboard_month_key,
  CASE 
    WHEN l.month_key = m.month_key THEN 'MATCH'
    ELSE 'NO MATCH'
  END as status
FROM leads l
LEFT JOIN monthly_dashboards m ON l.user_id = m.user_id
ORDER BY l.created_at DESC;
