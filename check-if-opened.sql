-- Check if the status was updated for your email

SELECT 
  cl.id,
  cl.status,
  cl.sent_at,
  cl.opened_at,
  l.email
FROM campaign_leads cl
JOIN leads l ON l.id = cl.lead_id
WHERE l.email = 'b0bbyyyyy@aol.com'
  AND cl.sent_at IS NOT NULL
ORDER BY cl.sent_at DESC
LIMIT 5;

-- Also check email_events
SELECT 
  ee.event_type,
  ee.created_at,
  l.email
FROM email_events ee
JOIN campaign_leads cl ON cl.id = ee.campaign_lead_id
JOIN leads l ON l.id = cl.lead_id
WHERE l.email = 'b0bbyyyyy@aol.com'
ORDER BY ee.created_at DESC
LIMIT 10;
