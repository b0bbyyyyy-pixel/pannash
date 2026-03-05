-- FINAL RLS FIX - Comprehensive fix for campaign_leads visibility
-- Run this entire script in Supabase SQL Editor

-- ============================================
-- PART 1: DIAGNOSE THE ISSUE
-- ============================================

-- Check if data exists (as superuser, bypassing RLS)
ALTER TABLE campaign_leads DISABLE ROW LEVEL SECURITY;
ALTER TABLE leads DISABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns DISABLE ROW LEVEL SECURITY;

-- Verify data exists
SELECT 
  'campaign_leads' as table_name,
  COUNT(*) as row_count
FROM campaign_leads
UNION ALL
SELECT 
  'leads' as table_name,
  COUNT(*) as row_count
FROM leads
UNION ALL
SELECT 
  'campaigns' as table_name,
  COUNT(*) as row_count
FROM campaigns;

-- Check the actual data with user_id
SELECT 
  c.name as campaign_name,
  c.user_id as campaign_user_id,
  COUNT(cl.id) as lead_count,
  STRING_AGG(DISTINCT l.email, ', ') as sample_emails
FROM campaigns c
LEFT JOIN campaign_leads cl ON cl.campaign_id = c.id
LEFT JOIN leads l ON l.id = cl.lead_id
GROUP BY c.id, c.name, c.user_id
ORDER BY c.created_at DESC;

-- ============================================
-- PART 2: DROP ALL EXISTING POLICIES
-- ============================================

-- Drop all policies dynamically
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT policyname, tablename
    FROM pg_policies
    WHERE tablename IN ('leads', 'campaigns', 'campaign_leads', 'email_events', 'email_queue')
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- ============================================
-- PART 3: CREATE SIMPLE, PERMISSIVE POLICIES
-- ============================================

-- LEADS table: Full CRUD for authenticated users
CREATE POLICY "leads_select" ON leads
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "leads_insert" ON leads
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "leads_update" ON leads
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "leads_delete" ON leads
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- CAMPAIGNS table: Full CRUD for authenticated users
CREATE POLICY "campaigns_select" ON campaigns
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "campaigns_insert" ON campaigns
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "campaigns_update" ON campaigns
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "campaigns_delete" ON campaigns
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- CAMPAIGN_LEADS table: Permissive policy for authenticated users
-- Allow select if the campaign belongs to the user OR the lead belongs to the user
CREATE POLICY "campaign_leads_select" ON campaign_leads
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM campaigns 
      WHERE campaigns.id = campaign_leads.campaign_id 
      AND campaigns.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM leads 
      WHERE leads.id = campaign_leads.lead_id 
      AND leads.user_id = auth.uid()
    )
  );

CREATE POLICY "campaign_leads_insert" ON campaign_leads
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM campaigns 
      WHERE campaigns.id = campaign_leads.campaign_id 
      AND campaigns.user_id = auth.uid()
    )
  );

CREATE POLICY "campaign_leads_update_user" ON campaign_leads
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM campaigns 
      WHERE campaigns.id = campaign_leads.campaign_id 
      AND campaigns.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM campaigns 
      WHERE campaigns.id = campaign_leads.campaign_id 
      AND campaigns.user_id = auth.uid()
    )
  );

CREATE POLICY "campaign_leads_delete" ON campaign_leads
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM campaigns 
      WHERE campaigns.id = campaign_leads.campaign_id 
      AND campaigns.user_id = auth.uid()
    )
  );

-- Anonymous policy for tracking (email opens, clicks, etc.)
CREATE POLICY "campaign_leads_tracking" ON campaign_leads
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (
    status IN ('opened', 'clicked', 'replied', 'bounced')
  );

-- EMAIL_EVENTS table
CREATE POLICY "email_events_select" ON email_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM campaign_leads cl
      JOIN campaigns c ON c.id = cl.campaign_id
      WHERE cl.id = email_events.campaign_lead_id
      AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "email_events_tracking" ON email_events
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- EMAIL_QUEUE table
CREATE POLICY "email_queue_select" ON email_queue
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM campaigns 
      WHERE campaigns.id = email_queue.campaign_id 
      AND campaigns.user_id = auth.uid()
    )
  );

CREATE POLICY "email_queue_manage" ON email_queue
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM campaigns 
      WHERE campaigns.id = email_queue.campaign_id 
      AND campaigns.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM campaigns 
      WHERE campaigns.id = email_queue.campaign_id 
      AND campaigns.user_id = auth.uid()
    )
  );

-- ============================================
-- PART 4: RE-ENABLE RLS
-- ============================================

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_queue ENABLE ROW LEVEL SECURITY;

-- ============================================
-- PART 5: VERIFY POLICIES
-- ============================================

SELECT 
  schemaname,
  tablename,
  policyname,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename IN ('leads', 'campaigns', 'campaign_leads', 'email_events', 'email_queue')
ORDER BY tablename, policyname;

-- ============================================
-- PART 6: TEST AS AUTHENTICATED USER
-- ============================================

-- This should now return data (run after the policies are created)
-- You'll need to check this in your app, but here's a test query:

SELECT 
  c.id as campaign_id,
  c.name as campaign_name,
  c.user_id,
  COUNT(cl.id) as campaign_leads_count
FROM campaigns c
LEFT JOIN campaign_leads cl ON cl.campaign_id = c.id
WHERE c.user_id = auth.uid()
GROUP BY c.id, c.name, c.user_id;
