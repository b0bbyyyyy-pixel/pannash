-- Find the campaign_lead_id for your email to test tracking

SELECT 
  cl.id as campaign_lead_id,
  l.email,
  cl.status,
  cl.sent_at
FROM campaign_leads cl
JOIN leads l ON l.id = cl.lead_id
WHERE l.email = 'b0bbyyyyy@aol.com'
  AND cl.sent_at IS NOT NULL
ORDER BY cl.sent_at DESC
LIMIT 1;
