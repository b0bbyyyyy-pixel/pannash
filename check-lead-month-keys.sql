-- Check what month_key values exist in leads table
SELECT 
  id,
  name,
  month_key,
  created_at
FROM leads
ORDER BY created_at DESC;
