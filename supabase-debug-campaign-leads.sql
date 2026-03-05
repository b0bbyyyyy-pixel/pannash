-- Debug query to check what's happening with campaign_leads
-- Run this to see if campaign_leads exist but aren't being returned due to RLS

-- 1. Check campaign_leads count (as admin, bypassing RLS)
SELECT 'Total campaign_leads (admin view)' as check_type, COUNT(*) as count 
FROM campaign_leads;

-- 2. Check campaign_leads by campaign (admin view)
SELECT 
  c.name as campaign_name,
  c.id as campaign_id,
  c.user_id,
  COUNT(cl.id) as lead_count
FROM campaigns c
LEFT JOIN campaign_leads cl ON cl.campaign_id = c.id
GROUP BY c.id, c.name, c.user_id
ORDER BY c.created_at DESC;

-- 3. Check if the campaign_leads -> leads JOIN is working
SELECT 
  cl.id as campaign_lead_id,
  cl.campaign_id,
  cl.lead_id,
  cl.status,
  l.id as lead_exists,
  l.name as lead_name,
  l.email as lead_email
FROM campaign_leads cl
LEFT JOIN leads l ON l.id = cl.lead_id
ORDER BY cl.created_at DESC
LIMIT 20;

-- 4. Check RLS policies are correct
SELECT 
  schemaname, 
  tablename, 
  policyname, 
  permissive, 
  roles, 
  cmd,
  qual as using_expression,
  with_check
FROM pg_policies 
WHERE tablename IN ('campaign_leads', 'leads', 'campaigns')
ORDER BY tablename, cmd, roles;

-- 5. Test if authenticated user can see their campaign_leads
-- (This will fail if RLS is blocking access)
SET LOCAL ROLE authenticated;
SELECT 
  cl.id,
  cl.campaign_id,
  cl.lead_id,
  cl.status,
  l.name,
  l.email
FROM campaign_leads cl
LEFT JOIN leads l ON l.id = cl.lead_id
LIMIT 5;
RESET ROLE;
