-- add-casper-foundation.sql — safe to re-run
ALTER TABLE casper_lead_state
  ADD COLUMN IF NOT EXISTS plan_note         TEXT,
  ADD COLUMN IF NOT EXISTS plan_updated_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS wait_until        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS burst_started_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS run_pending       BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS lock_token        UUID,
  ADD COLUMN IF NOT EXISTS lock_until        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_guard_result TEXT;

ALTER TABLE casper_runs
  ADD COLUMN IF NOT EXISTS stage            TEXT,
  ADD COLUMN IF NOT EXISTS guard_results    JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS context_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS plan_note        TEXT;

CREATE INDEX IF NOT EXISTS casper_lead_state_run_pending_idx
  ON casper_lead_state (wait_until) WHERE run_pending;

-- Extend the per-lead settle window on every inbound (capped from burst start)
CREATE OR REPLACE FUNCTION casper_note_inbound(
  p_lead UUID, p_user UUID, p_settle_sec INT DEFAULT 25, p_max_settle_sec INT DEFAULT 75)
RETURNS TIMESTAMPTZ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_until TIMESTAMPTZ;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user THEN RAISE EXCEPTION 'forbidden'; END IF;
  INSERT INTO casper_lead_state AS s
    (lead_id, user_id, phase, run_pending, burst_started_at, wait_until, updated_at)
  VALUES (p_lead, p_user, 'chatting', TRUE, now(),
          now() + make_interval(secs => p_settle_sec), now())
  ON CONFLICT (lead_id) DO UPDATE SET
    burst_started_at = CASE WHEN s.run_pending AND s.burst_started_at IS NOT NULL
                            THEN s.burst_started_at ELSE now() END,
    wait_until = LEAST(
      now() + make_interval(secs => p_settle_sec),
      (CASE WHEN s.run_pending AND s.burst_started_at IS NOT NULL
            THEN s.burst_started_at ELSE now() END) + make_interval(secs => p_max_settle_sec)),
    run_pending = TRUE,
    updated_at = now()
  WHERE s.user_id = p_user
  RETURNING s.wait_until INTO v_until;
  RETURN v_until;
END $$;

-- Atomic per-lead lock with stale expiry. Returns token, or NULL if held.
CREATE OR REPLACE FUNCTION casper_try_lock(p_lead UUID, p_user UUID, p_ttl_sec INT DEFAULT 90)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_token UUID := gen_random_uuid(); v_got UUID;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user THEN RAISE EXCEPTION 'forbidden'; END IF;
  INSERT INTO casper_lead_state AS s (lead_id, user_id, phase, lock_token, lock_until, updated_at)
  VALUES (p_lead, p_user, 'chatting', v_token, now() + make_interval(secs => p_ttl_sec), now())
  ON CONFLICT (lead_id) DO UPDATE SET
    lock_token = EXCLUDED.lock_token, lock_until = EXCLUDED.lock_until, updated_at = now()
  WHERE s.user_id = p_user AND (s.lock_until IS NULL OR s.lock_until < now())
  RETURNING s.lock_token INTO v_got;
  RETURN v_got;
END $$;

-- Claim the pending run (only the lock holder, only once settled)
CREATE OR REPLACE FUNCTION casper_claim_run(p_lead UUID, p_token UUID)
RETURNS TIMESTAMPTZ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_started TIMESTAMPTZ;
BEGIN
  UPDATE casper_lead_state
     SET run_pending = FALSE, updated_at = now()
   WHERE lead_id = p_lead AND lock_token = p_token AND run_pending
     AND (wait_until IS NULL OR wait_until <= now())
     AND (auth.uid() IS NULL OR user_id = auth.uid())
  RETURNING burst_started_at INTO v_started;
  RETURN v_started;
END $$;

CREATE OR REPLACE FUNCTION casper_release_lock(p_lead UUID, p_token UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE casper_lead_state SET lock_token = NULL, lock_until = NULL, updated_at = now()
   WHERE lead_id = p_lead AND lock_token = p_token
     AND (auth.uid() IS NULL OR user_id = auth.uid());
END $$;

REVOKE ALL ON FUNCTION casper_note_inbound(UUID,UUID,INT,INT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION casper_try_lock(UUID,UUID,INT)        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION casper_claim_run(UUID,UUID)           FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION casper_release_lock(UUID,UUID)        FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION casper_note_inbound(UUID,UUID,INT,INT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION casper_try_lock(UUID,UUID,INT)        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION casper_claim_run(UUID,UUID)           TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION casper_release_lock(UUID,UUID)        TO authenticated, service_role;

-- Rename historical Casper sender tag. Extend CHECK/enum first if present.
DO $$
DECLARE r RECORD;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'inbox_messages' AND column_name = 'sent_by'
  ) THEN
    FOR r IN
      SELECT conname FROM pg_constraint
      WHERE conrelid = 'public.inbox_messages'::regclass
        AND pg_get_constraintdef(oid) ILIKE '%sent_by%'
    LOOP
      EXECUTE format('ALTER TABLE inbox_messages DROP CONSTRAINT IF EXISTS %I', r.conname);
    END LOOP;
    ALTER TABLE inbox_messages
      ADD CONSTRAINT inbox_messages_sent_by_check
      CHECK (sent_by IN ('user','casper','calvin','system'));
    UPDATE inbox_messages SET sent_by = 'casper' WHERE sent_by = 'calvin';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'casper_outbox' AND column_name = 'sent_by'
  ) THEN
    UPDATE casper_outbox SET sent_by = 'casper' WHERE sent_by = 'calvin';
  END IF;
END $$;

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS business_name TEXT,
  ADD COLUMN IF NOT EXISTS business_name_updated_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS casper_settings_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  field TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip TEXT
);

ALTER TABLE casper_settings_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS casper_settings_audit_own ON casper_settings_audit;
CREATE POLICY casper_settings_audit_own ON casper_settings_audit
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT ON casper_settings_audit TO authenticated, service_role;

-- business_name may only change via the password-protected route (service_role).
CREATE OR REPLACE FUNCTION casper_protect_business_name()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND (NEW.business_name IS DISTINCT FROM OLD.business_name
          OR NEW.business_name_updated_at IS DISTINCT FROM OLD.business_name_updated_at)
     AND auth.uid() IS NOT NULL
     AND COALESCE(auth.role(), '') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'business_name cannot be changed here';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS casper_protect_business_name ON user_settings;
CREATE TRIGGER casper_protect_business_name
  BEFORE UPDATE ON user_settings
  FOR EACH ROW EXECUTE FUNCTION casper_protect_business_name();

NOTIFY pgrst, 'reload schema';
