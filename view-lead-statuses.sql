-- Check the actual status of all leads in Testing Outreach campaign

SELECT 
  cl.id,
  cl.status,
  cl.sent_at,
  cl.opened_at,
  cl.replied_at,
  cl.bounced_at,
  cl.bounce_reason,
  cl.error_message,
  l.email,
  l.name
FROM campaign_leads cl
JOIN leads l ON l.id = cl.lead_id
WHERE cl.campaign_id = '1cb56daf-ec7a-43a3-8573-0c5d5a48108b'
ORDER BY cl.created_at ASC;
