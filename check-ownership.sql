-- Check which user owns what

-- 1. Campaigns ownership
SELECT 
  'CAMPAIGNS' as table_name,
  user_id,
  COUNT(*) as count,
  STRING_AGG(name, ', ') as names
FROM campaigns
GROUP BY user_id;

-- 2. Leads ownership
SELECT 
  'LEADS' as table_name,
  user_id,
  COUNT(*) as count
FROM leads
GROUP BY user_id;

-- 3. Map to actual email addresses
SELECT 
  c.name as campaign_name,
  c.user_id as campaign_user_id,
  u.email as campaign_owner_email,
  COUNT(cl.id) as lead_count
FROM campaigns c
LEFT JOIN auth.users u ON u.id = c.user_id
LEFT JOIN campaign_leads cl ON cl.campaign_id = c.id
GROUP BY c.id, c.name, c.user_id, u.email;
