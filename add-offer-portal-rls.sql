-- Offer portal RLS. Idempotent. Run in the Supabase SQL editor.
-- Public /portal/[token] keeps working via server-side service-role reads filtered by token.
-- No anon policies. Authenticated users only see their own rows.

ALTER TABLE client_offer_portals ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_activity_logs ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'client_offer_portals'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON client_offer_portals', r.policyname);
  END LOOP;

  FOR r IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'portal_activity_logs'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON portal_activity_logs', r.policyname);
  END LOOP;
END $$;

CREATE POLICY client_offer_portals_owner_select ON client_offer_portals
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY client_offer_portals_owner_insert ON client_offer_portals
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY client_offer_portals_owner_update ON client_offer_portals
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY client_offer_portals_owner_delete ON client_offer_portals
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY portal_activity_logs_owner_select ON portal_activity_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM client_offer_portals p
      WHERE p.id = portal_activity_logs.portal_id
        AND p.user_id = auth.uid()
    )
  );

CREATE POLICY portal_activity_logs_owner_delete ON portal_activity_logs
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM client_offer_portals p
      WHERE p.id = portal_activity_logs.portal_id
        AND p.user_id = auth.uid()
    )
  );

REVOKE ALL ON TABLE client_offer_portals FROM anon;
REVOKE ALL ON TABLE portal_activity_logs FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE client_offer_portals TO authenticated;
GRANT SELECT, DELETE ON TABLE portal_activity_logs TO authenticated;

CREATE INDEX IF NOT EXISTS client_offer_portals_token_idx
  ON client_offer_portals (token);
