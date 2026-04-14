-- EMERGENCY FIX: Temporarily disable RLS to verify data exists
-- Then re-enable with correct policies

-- Step 1: Check if data exists (bypass RLS temporarily)
SELECT 'Checking if campaign_leads exist...' as step;

SELECT 
  c.name as campaign_name,
  c.created_at,
  COUNT(cl.id) as campaign_leads_count,
  STRING_AGG(DISTINCT cl.status, ', ') as statuses
FROM campaigns c
LEFT JOIN campaign_leads cl ON cl.campaign_id = c.id
GROUP BY c.name, c.created_at
ORDER BY c.created_at DESC;

SELECT 'Checking if leads exist...' as step;

SELECT COUNT(*) as total_leads FROM leads;

-- Step 2: Temporarily disable RLS to confirm the query works
ALTER TABLE campaign_leads DISABLE ROW LEVEL SECURITY;
ALTER TABLE leads DISABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns DISABLE ROW LEVEL SECURITY;

SELECT 'RLS DISABLED - Testing query...' as step;

-- Test the exact query that the app uses
SELECT 
  cl.id,
  cl.status,
  cl.sent_at,
  cl.opened_at,
  cl.replied_at,
  l.name as lead_name,
  l.email as lead_email,
  l.phone as lead_phone,
  l.company as lead_company
FROM campaign_leads cl
LEFT JOIN leads l ON l.id = cl.lead_id
LEFT JOIN campaigns c ON c.id = cl.campaign_id
ORDER BY cl.created_at ASC
LIMIT 10;

-- Step 3: Re-enable RLS with CORRECT policies
ALTER TABLE campaign_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;

-- Drop ALL existing policies to start clean
DO $$ 
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT policyname, tablename 
    FROM pg_policies 
    WHERE tablename IN ('leads', 'campaigns', 'campaign_leads', 'email_events')
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- LEADS: Simple user-based access
CREATE POLICY "leads_select" ON leads FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "leads_insert" ON leads FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "leads_update" ON leads FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "leads_delete" ON leads FOR DELETE TO authenticated USING (user_id = auth.uid());

-- CAMPAIGNS: Simple user-based access
CREATE POLICY "campaigns_select" ON campaigns FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "campaigns_insert" ON campaigns FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "campaigns_update" ON campaigns FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "campaigns_delete" ON campaigns FOR DELETE TO authenticated USING (user_id = auth.uid());

-- CAMPAIGN_LEADS: Access through campaign ownership
CREATE POLICY "campaign_leads_select" ON campaign_leads FOR SELECT TO authenticated 
USING (campaign_id IN (SELECT id FROM campaigns WHERE user_id = auth.uid()));

CREATE POLICY "campaign_leads_insert" ON campaign_leads FOR INSERT TO authenticated 
WITH CHECK (campaign_id IN (SELECT id FROM campaigns WHERE user_id = auth.uid()));

CREATE POLICY "campaign_leads_update_user" ON campaign_leads FOR UPDATE TO authenticated 
USING (campaign_id IN (SELECT id FROM campaigns WHERE user_id = auth.uid()));

CREATE POLICY "campaign_leads_delete" ON campaign_leads FOR DELETE TO authenticated 
USING (campaign_id IN (SELECT id FROM campaigns WHERE user_id = auth.uid()));

-- ANONYMOUS TRACKING: Only for email opens/clicks
CREATE POLICY "campaign_leads_tracking" ON campaign_leads FOR UPDATE TO anon
USING (true)
WITH CHECK (status IN ('opened', 'replied', 'clicked', 'bounced'));

-- EMAIL_EVENTS
CREATE POLICY "email_events_select" ON email_events FOR SELECT TO authenticated
USING (campaign_lead_id IN (
  SELECT cl.id FROM campaign_leads cl
  JOIN campaigns c ON c.id = cl.campaign_id
  WHERE c.user_id = auth.uid()
));

CREATE POLICY "email_events_tracking" ON email_events FOR INSERT TO anon WITH CHECK (true);

-- Verify policies
SELECT 'Final policy check:' as step;
SELECT tablename, policyname, roles, cmd
FROM pg_policies 
WHERE tablename IN ('leads', 'campaigns', 'campaign_leads', 'email_events')
ORDER BY tablename, roles, cmd;
