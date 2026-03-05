-- DEBUG: Find out why campaign_leads aren't showing

-- 1. Check all campaigns with their user_id
SELECT 
  id,
  name,
  user_id,
  status,
  created_at
FROM campaigns
ORDER BY created_at DESC;

-- 2. Check all campaign_leads with full details
SELECT 
  cl.id as campaign_lead_id,
  cl.campaign_id,
  cl.lead_id,
  cl.status,
  cl.created_at,
  c.user_id as campaign_user_id,
  l.user_id as lead_user_id,
  l.name as lead_name,
  l.email as lead_email
FROM campaign_leads cl
LEFT JOIN campaigns c ON c.id = cl.campaign_id
LEFT JOIN leads l ON l.id = cl.lead_id
ORDER BY cl.created_at DESC
LIMIT 20;

-- 3. Check if leads have the correct user_id
SELECT 
  id,
  name,
  email,
  user_id,
  list_id,
  created_at
FROM leads
ORDER BY created_at DESC
LIMIT 20;

-- 4. Check the auth.users table to see your actual user_id
SELECT 
  id as user_id,
  email,
  created_at
FROM auth.users
ORDER BY created_at DESC;
