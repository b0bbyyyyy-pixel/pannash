-- Comprehensive RLS fix for all related tables
-- This ensures authenticated users can access their data properly

-- ==========================================
-- LEADS TABLE
-- ==========================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view their leads" ON leads;
DROP POLICY IF EXISTS "Users can insert their leads" ON leads;
DROP POLICY IF EXISTS "Users can update their leads" ON leads;
DROP POLICY IF EXISTS "Users can delete their leads" ON leads;

-- Create fresh policies
CREATE POLICY "Users can view their leads"
ON leads
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can insert their leads"
ON leads
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their leads"
ON leads
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their leads"
ON leads
FOR DELETE
TO authenticated
USING (user_id = auth.uid());

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- CAMPAIGNS TABLE
-- ==========================================

DROP POLICY IF EXISTS "Users can view their campaigns" ON campaigns;
DROP POLICY IF EXISTS "Users can insert their campaigns" ON campaigns;
DROP POLICY IF EXISTS "Users can update their campaigns" ON campaigns;
DROP POLICY IF EXISTS "Users can delete their campaigns" ON campaigns;

CREATE POLICY "Users can view their campaigns"
ON campaigns
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can insert their campaigns"
ON campaigns
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their campaigns"
ON campaigns
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their campaigns"
ON campaigns
FOR DELETE
TO authenticated
USING (user_id = auth.uid());

ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- CAMPAIGN_LEADS TABLE
-- ==========================================

DROP POLICY IF EXISTS "Allow anonymous tracking updates" ON campaign_leads;
DROP POLICY IF EXISTS "Users can view their campaign leads" ON campaign_leads;
DROP POLICY IF EXISTS "Users can insert their campaign leads" ON campaign_leads;
DROP POLICY IF EXISTS "Users can update their campaign leads" ON campaign_leads;
DROP POLICY IF EXISTS "Users can delete their campaign leads" ON campaign_leads;

-- Create user policies FIRST (highest priority)
CREATE POLICY "Users can view their campaign leads"
ON campaign_leads
FOR SELECT
TO authenticated
USING (
  campaign_id IN (
    SELECT id FROM campaigns WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert their campaign leads"
ON campaign_leads
FOR INSERT
TO authenticated
WITH CHECK (
  campaign_id IN (
    SELECT id FROM campaigns WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can update their campaign leads"
ON campaign_leads
FOR UPDATE
TO authenticated
USING (
  campaign_id IN (
    SELECT id FROM campaigns WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  campaign_id IN (
    SELECT id FROM campaigns WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete their campaign leads"
ON campaign_leads
FOR DELETE
TO authenticated
USING (
  campaign_id IN (
    SELECT id FROM campaigns WHERE user_id = auth.uid()
  )
);

-- Anonymous tracking policy LAST (lowest priority)
CREATE POLICY "Allow anonymous tracking updates"
ON campaign_leads
FOR UPDATE
TO anon
USING (true)
WITH CHECK (
  status IN ('opened', 'replied', 'clicked', 'bounced')
);

ALTER TABLE campaign_leads ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- EMAIL_EVENTS TABLE
-- ==========================================

DROP POLICY IF EXISTS "Allow anonymous tracking inserts" ON email_events;
DROP POLICY IF EXISTS "Users can view their email events" ON email_events;

CREATE POLICY "Users can view their email events"
ON email_events
FOR SELECT
TO authenticated
USING (
  campaign_lead_id IN (
    SELECT cl.id
    FROM campaign_leads cl
    INNER JOIN campaigns c ON c.id = cl.campaign_id
    WHERE c.user_id = auth.uid()
  )
);

CREATE POLICY "Allow anonymous tracking inserts"
ON email_events
FOR INSERT
TO anon
WITH CHECK (true);

ALTER TABLE email_events ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- VERIFY
-- ==========================================

-- Show all policies
SELECT 
  tablename,
  policyname,
  roles,
  cmd
FROM pg_policies 
WHERE tablename IN ('leads', 'campaigns', 'campaign_leads', 'email_events')
ORDER BY tablename, cmd, roles;
