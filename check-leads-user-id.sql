-- Check if leads have the correct user_id

-- 1. Show all leads and their user_id
SELECT 
  id,
  name,
  email,
  user_id,
  created_at
FROM leads
ORDER BY created_at DESC;

-- 2. Compare campaign_leads to leads user_id
SELECT 
  cl.id as campaign_lead_id,
  cl.campaign_id,
  cl.lead_id,
  c.user_id as campaign_user_id,
  l.user_id as lead_user_id,
  l.email as lead_email,
  CASE 
    WHEN c.user_id = l.user_id THEN '✓ MATCH'
    WHEN l.user_id IS NULL THEN '✗ NULL'
    ELSE '✗ MISMATCH'
  END as status
FROM campaign_leads cl
JOIN campaigns c ON c.id = cl.campaign_id
LEFT JOIN leads l ON l.id = cl.lead_id
WHERE c.id = '1cb56daf-ec7a-43a3-8573-0c5d5a48108b';
