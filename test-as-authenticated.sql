-- Test the exact query that the app uses, simulating RLS for b0bbyyyyy@aol.com user

-- First, let's see what user_id the b0bbyyyyy account has
SELECT id, email FROM auth.users WHERE email = 'b0bbyyyyy@aol.com';

-- Now test if campaign_leads can be selected with RLS enabled
-- This simulates what happens in the app

-- Set the user context (replace with actual user_id from above)
SET LOCAL jwt.claims.sub = '92210058-756c-4532-8764-69c6ba1be8ab';

-- Now try the query the app uses
SELECT 
  cl.id,
  cl.status,
  cl.sent_at,
  cl.opened_at,
  cl.replied_at,
  cl.bounced_at,
  cl.bounce_reason,
  cl.error_message,
  cl.next_email_at,
  cl.loop_count,
  l.name,
  l.email,
  l.phone,
  l.company
FROM campaign_leads cl
LEFT JOIN leads l ON l.id = cl.lead_id
WHERE cl.campaign_id = '1cb56daf-ec7a-43a3-8573-0c5d5a48108b'
ORDER BY cl.created_at ASC;

-- Reset
RESET jwt.claims.sub;

-- Also check if the issue is the LEFT JOIN on leads
-- Try without the join
SELECT 
  cl.id,
  cl.status,
  cl.lead_id,
  cl.campaign_id
FROM campaign_leads cl
WHERE cl.campaign_id = '1cb56daf-ec7a-43a3-8573-0c5d5a48108b';
