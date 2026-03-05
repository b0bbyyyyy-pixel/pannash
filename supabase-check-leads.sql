-- Diagnostic query to check leads and campaign_leads status

-- 1. Check if leads exist
SELECT 'Total Leads' as check_type, COUNT(*) as count FROM leads;

-- 2. Check if campaign_leads exist
SELECT 'Total Campaign Leads' as check_type, COUNT(*) as count FROM campaign_leads;

-- 3. Check if campaigns exist
SELECT 'Total Campaigns' as check_type, COUNT(*) as count FROM campaigns;

-- 4. Check lead_lists
SELECT 'Total Lead Lists' as check_type, COUNT(*) as count FROM lead_lists;

-- 5. Check leads by list
SELECT 
  ll.name as list_name,
  ll.id as list_id,
  COUNT(l.id) as lead_count
FROM lead_lists ll
LEFT JOIN leads l ON l.list_id = ll.id
GROUP BY ll.id, ll.name
ORDER BY ll.created_at DESC;

-- 6. Check campaign_leads by campaign
SELECT 
  c.name as campaign_name,
  c.id as campaign_id,
  COUNT(cl.id) as campaign_lead_count
FROM campaigns c
LEFT JOIN campaign_leads cl ON cl.campaign_id = c.id
GROUP BY c.id, c.name
ORDER BY c.created_at DESC;

-- 7. Check if there are any orphaned leads (leads not in any campaign)
SELECT 
  l.id,
  l.name,
  l.email,
  l.list_id,
  ll.name as list_name,
  CASE WHEN cl.id IS NULL THEN 'Not in any campaign' ELSE 'In campaign' END as status
FROM leads l
LEFT JOIN lead_lists ll ON ll.id = l.list_id
LEFT JOIN campaign_leads cl ON cl.lead_id = l.id
ORDER BY l.created_at DESC
LIMIT 20;
