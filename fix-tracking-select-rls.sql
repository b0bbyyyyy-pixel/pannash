-- Allow anon users to SELECT campaign_leads (needed for tracking endpoint to verify lead exists)

CREATE POLICY "campaign_leads_tracking_select" ON campaign_leads
  FOR SELECT
  TO anon
  USING (true);

-- Verify all policies
SELECT 
  tablename,
  policyname,
  roles,
  cmd
FROM pg_policies
WHERE tablename = 'campaign_leads'
ORDER BY policyname;
