-- Simple test to verify campaign_leads data exists and is accessible
-- Run this in Supabase SQL Editor

-- 1. Check if campaign_leads table has data (as superuser, ignoring RLS)
SELECT COUNT(*) as total_campaign_leads FROM campaign_leads;

-- 2. Check a specific campaign's leads
SELECT 
  cl.id,
  cl.campaign_id,
  cl.lead_id,
  cl.status,
  l.name,
  l.email
FROM campaign_leads cl
LEFT JOIN leads l ON l.id = cl.lead_id
ORDER BY cl.created_at DESC
LIMIT 20;

-- 3. Check RLS policies are present
SELECT 
  schemaname,
  tablename,
  policyname,
  roles,
  cmd
FROM pg_policies
WHERE tablename = 'campaign_leads'
ORDER BY policyname;
