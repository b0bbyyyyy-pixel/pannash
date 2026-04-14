-- Check actual statuses of campaign leads for Testing Outreach campaign

-- First, check what columns actually exist in campaign_leads
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'campaign_leads' 
ORDER BY ordinal_position;

-- Then show the actual data
SELECT 
  cl.id,
  cl.status,
  cl.sent_at,
  cl.opened_at,
  cl.replied_at,
  l.email,
  l.name
FROM campaign_leads cl
JOIN leads l ON l.id = cl.lead_id
WHERE cl.campaign_id = '1cb56daf-ec7a-43a3-8573-0c5d5a48108b'
ORDER BY cl.created_at ASC;

-- Check email_events for these leads
SELECT 
  ee.event_type,
  ee.created_at,
  cl.id as campaign_lead_id,
  l.email
FROM email_events ee
JOIN campaign_leads cl ON cl.id = ee.campaign_lead_id
JOIN leads l ON l.id = cl.lead_id
WHERE cl.campaign_id = '1cb56daf-ec7a-43a3-8573-0c5d5a48108b'
ORDER BY ee.created_at DESC
LIMIT 50;
