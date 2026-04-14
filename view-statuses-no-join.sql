-- Check campaign_leads without JOIN (to avoid RLS issues)

-- First, verify the campaign exists and get its ID
SELECT 
  id,
  name,
  status,
  user_id
FROM campaigns
WHERE name = 'Testing Outreach'
ORDER BY created_at DESC;

-- Then check campaign_leads directly
SELECT 
  id,
  campaign_id,
  lead_id,
  status,
  sent_at,
  opened_at,
  replied_at,
  bounced_at,
  bounce_reason,
  error_message
FROM campaign_leads
WHERE campaign_id = '1cb56daf-ec7a-43a3-8573-0c5d5a48108b'
ORDER BY created_at ASC;

-- Check if there are ANY campaign_leads at all
SELECT 
  campaign_id,
  COUNT(*) as lead_count,
  STRING_AGG(DISTINCT status, ', ') as statuses
FROM campaign_leads
GROUP BY campaign_id;
