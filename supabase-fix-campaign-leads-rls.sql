-- Fix RLS policies for campaign_leads
-- The issue: When we added anonymous tracking updates, we might have broken user read access

-- First, let's check what policies exist
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'campaign_leads';

-- Drop ALL existing policies on campaign_leads to start fresh
DROP POLICY IF EXISTS "Allow anonymous tracking updates" ON campaign_leads;
DROP POLICY IF EXISTS "Users can view their campaign leads" ON campaign_leads;
DROP POLICY IF EXISTS "Users can insert their campaign leads" ON campaign_leads;
DROP POLICY IF EXISTS "Users can update their campaign leads" ON campaign_leads;
DROP POLICY IF EXISTS "Users can delete their campaign leads" ON campaign_leads;

-- Recreate user policies FIRST (with proper precedence)

-- 1. SELECT - Users can view their own campaign leads
CREATE POLICY "Users can view their campaign leads"
ON campaign_leads
FOR SELECT
TO authenticated
USING (
  campaign_id IN (
    SELECT id FROM campaigns WHERE user_id = auth.uid()
  )
);

-- 2. INSERT - Users can insert their own campaign leads  
CREATE POLICY "Users can insert their campaign leads"
ON campaign_leads
FOR INSERT
TO authenticated
WITH CHECK (
  campaign_id IN (
    SELECT id FROM campaigns WHERE user_id = auth.uid()
  )
);

-- 3. UPDATE - Users can update their own campaign leads
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

-- 4. DELETE - Users can delete their own campaign leads
CREATE POLICY "Users can delete their campaign leads"
ON campaign_leads
FOR DELETE
TO authenticated
USING (
  campaign_id IN (
    SELECT id FROM campaigns WHERE user_id = auth.uid()
  )
);

-- 5. ANONYMOUS UPDATE - Allow tracking pixel updates (limited scope)
-- This is ONLY for email tracking (open/click detection)
CREATE POLICY "Allow anonymous tracking updates"
ON campaign_leads
FOR UPDATE
TO anon
USING (true)
WITH CHECK (
  -- Only allow updating to tracking-related statuses
  status IN ('opened', 'replied', 'clicked', 'bounced')
);

-- Verify RLS is enabled
ALTER TABLE campaign_leads ENABLE ROW LEVEL SECURITY;

-- Show final policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd
FROM pg_policies 
WHERE tablename = 'campaign_leads'
ORDER BY cmd, roles;
