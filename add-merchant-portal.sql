-- Merchant application portal (v1). Idempotent. Run in the Supabase SQL editor.
-- Offer-table RLS lives in add-offer-portal-rls.sql (run that too).

CREATE TABLE IF NOT EXISTS merchant_portals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  token_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  revoked_at timestamptz,
  last_viewed_at timestamptz,
  last_link_sent_at timestamptz,
  link_sends_last_hour int NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS merchant_portals_token_hash_uidx
  ON merchant_portals (token_hash);
CREATE INDEX IF NOT EXISTS merchant_portals_lead_id_idx
  ON merchant_portals (lead_id);
CREATE INDEX IF NOT EXISTS merchant_portals_user_id_idx
  ON merchant_portals (user_id);

ALTER TABLE merchant_portals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS merchant_portals_owner_select ON merchant_portals;
CREATE POLICY merchant_portals_owner_select ON merchant_portals
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS merchant_portals_owner_update ON merchant_portals;
CREATE POLICY merchant_portals_owner_update ON merchant_portals
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS merchant_portals_owner_delete ON merchant_portals;
CREATE POLICY merchant_portals_owner_delete ON merchant_portals
  FOR DELETE USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS merchant_portal_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  portal_id uuid,
  event_type text NOT NULL,
  event_data jsonb,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS merchant_portal_events_lead_created_idx
  ON merchant_portal_events (lead_id, created_at DESC);

ALTER TABLE merchant_portal_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS merchant_portal_events_owner_select ON merchant_portal_events;
CREATE POLICY merchant_portal_events_owner_select ON merchant_portal_events
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS merchant_portal_events_owner_update ON merchant_portal_events;
CREATE POLICY merchant_portal_events_owner_update ON merchant_portal_events
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS merchant_portal_events_owner_delete ON merchant_portal_events;
CREATE POLICY merchant_portal_events_owner_delete ON merchant_portal_events
  FOR DELETE USING (auth.uid() = user_id);

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS portal_stage_map jsonb,
  ADD COLUMN IF NOT EXISTS portal_enabled boolean DEFAULT true;

UPDATE user_settings
  SET portal_enabled = true
  WHERE portal_enabled IS NULL;
