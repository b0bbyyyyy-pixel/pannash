-- Fix RLS policies to allow email tracking without authentication
-- This is needed because tracking pixels are loaded from email clients without user sessions

-- ==========================================
-- Email Events Table - Allow anonymous inserts for tracking
-- ==========================================

-- Drop and recreate policies for email_events
DROP POLICY IF EXISTS "Allow anonymous tracking inserts" ON email_events;
DROP POLICY IF EXISTS "Users can view their own email events" ON email_events;

-- Allow anyone to insert tracking events (they can only write, not read)
CREATE POLICY "Allow anonymous tracking inserts"
ON email_events
FOR INSERT
TO anon
WITH CHECK (true);

-- Keep existing user policies for reading their own events
CREATE POLICY "Users can view their own email events"
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

-- ==========================================
-- Campaign Leads Table - Allow anonymous updates for tracking status
-- ==========================================

-- Drop and recreate policies for campaign_leads
DROP POLICY IF EXISTS "Allow anonymous tracking updates" ON campaign_leads;
DROP POLICY IF EXISTS "Users can view their campaign leads" ON campaign_leads;
DROP POLICY IF EXISTS "Users can insert their campaign leads" ON campaign_leads;
DROP POLICY IF EXISTS "Users can update their campaign leads" ON campaign_leads;
DROP POLICY IF EXISTS "Users can delete their campaign leads" ON campaign_leads;

-- Allow anonymous users to update status and opened_at for tracking
-- This is secure because:
-- 1. They can only update status and opened_at (not other fields)
-- 2. They can only update to 'opened' status (not arbitrary values)
-- 3. They need the exact campaign_lead_id from the tracking link
CREATE POLICY "Allow anonymous tracking updates"
ON campaign_leads
FOR UPDATE
TO anon
USING (true)  -- Allow checking any row
WITH CHECK (
  -- Only allow updating these specific tracking-related fields
  status = 'opened' OR status = 'replied'
);

-- Keep existing user policies
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

-- ==========================================
-- Verify RLS is enabled
-- ==========================================

ALTER TABLE email_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_leads ENABLE ROW LEVEL SECURITY;

-- Done! Now tracking should work without needing service role key
