-- ============================================================
-- SMS DRIP CAMPAIGNS — Database Setup
-- Run once in Supabase → SQL Editor.
-- ============================================================

-- 1. One drip job per run of a campaign (lead list)
CREATE TABLE IF NOT EXISTS sms_drip_jobs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  list_id          UUID NOT NULL REFERENCES lead_lists(id) ON DELETE CASCADE,
  status           TEXT NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active','paused','completed','cancelled')),
  templates        JSONB NOT NULL DEFAULT '[]'::jsonb,
  pace_min_seconds INT NOT NULL DEFAULT 60,
  pace_max_seconds INT NOT NULL DEFAULT 120,
  window_hours     NUMERIC NOT NULL DEFAULT 5,
  quiet_start      TEXT NOT NULL DEFAULT '09:00',   -- lead local time
  quiet_end        TEXT NOT NULL DEFAULT '20:00',   -- lead local time
  send_days        INT[] NOT NULL DEFAULT '{1,2,3,4,5,6}',  -- 0=Sun … 6=Sat (default Mon–Sat)
  skip_states      TEXT[] NOT NULL DEFAULT '{}',
  include_already_texted BOOLEAN NOT NULL DEFAULT FALSE,
  total_count      INT NOT NULL DEFAULT 0,
  sent_count       INT NOT NULL DEFAULT 0,
  next_send_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Per-lead send log for a job
CREATE TABLE IF NOT EXISTS sms_drip_sends (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id         UUID NOT NULL REFERENCES sms_drip_jobs(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id        UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  position       INT NOT NULL DEFAULT 0,
  phone          TEXT,
  sms_status     TEXT NOT NULL DEFAULT 'queued'
                   CHECK (sms_status IN ('queued','scheduled','sending','sent','failed','replied',
                                         'skipped_tz','skipped_state','skipped_dnc','skipped_dup')),
  template_index INT,
  scheduled_for  TIMESTAMPTZ,
  sent_at        TIMESTAMPTZ,
  error          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(job_id, lead_id)
);

-- 3. Saved templates per campaign (prefill the Run SMS modal)
ALTER TABLE lead_lists ADD COLUMN IF NOT EXISTS sms_templates JSONB;

-- 4. Inbox stacking: only replies bump threads. Track inbound separately.
ALTER TABLE inbox_conversations ADD COLUMN IF NOT EXISTS last_inbound_at TIMESTAMPTZ;
-- Backfill from existing data so current reply threads keep their order
UPDATE inbox_conversations SET last_inbound_at = last_message_at
  WHERE last_inbound_at IS NULL AND last_direction = 'inbound';

-- 5. RLS
ALTER TABLE sms_drip_jobs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_drip_sends ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own sms_drip_jobs" ON sms_drip_jobs;
CREATE POLICY "Users manage own sms_drip_jobs" ON sms_drip_jobs
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users manage own sms_drip_sends" ON sms_drip_sends;
CREATE POLICY "Users manage own sms_drip_sends" ON sms_drip_sends
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- 6. Indexes
CREATE INDEX IF NOT EXISTS idx_drip_jobs_user_status ON sms_drip_jobs(user_id, status);
CREATE INDEX IF NOT EXISTS idx_drip_jobs_list        ON sms_drip_jobs(list_id);
CREATE INDEX IF NOT EXISTS idx_drip_sends_job        ON sms_drip_sends(job_id, sms_status, position);
CREATE INDEX IF NOT EXISTS idx_drip_sends_lead       ON sms_drip_sends(lead_id) WHERE sms_status IN ('queued','scheduled');

-- 7. Inbound ingest — updated:
--    • sets last_inbound_at (replies bump Inbox; drip outbound does not)
--    • cancels pending drip sends for the lead the moment they reply
CREATE OR REPLACE FUNCTION ingest_inbound_sms(
  p_from text,
  p_to text,
  p_body text,
  p_sid text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from10 text;
  v_to10 text;
  v_user uuid;
  v_lead uuid;
  v_conv uuid;
  v_unread int;
  v_preview text;
BEGIN
  IF p_from IS NULL OR btrim(p_from) = '' OR p_body IS NULL OR btrim(p_body) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_from_or_body');
  END IF;

  v_from10 := right(regexp_replace(coalesce(p_from, ''), '\D', '', 'g'), 10);
  v_to10 := right(regexp_replace(coalesce(p_to, ''), '\D', '', 'g'), 10);
  v_preview := left(p_body, 100);

  SELECT user_id INTO v_user
  FROM phone_connections
  WHERE right(regexp_replace(coalesce(phone_number, ''), '\D', '', 'g'), 10) = v_to10
  LIMIT 1;

  IF v_user IS NULL THEN
    SELECT user_id INTO v_user
    FROM phone_connections
    LIMIT 1;
  END IF;

  IF v_user IS NOT NULL THEN
    SELECT id INTO v_lead
    FROM leads
    WHERE user_id = v_user
      AND right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10) = v_from10
    ORDER BY updated_at DESC NULLS LAST
    LIMIT 1;
  END IF;

  IF v_lead IS NULL THEN
    SELECT id, user_id INTO v_lead, v_user
    FROM leads
    WHERE right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10) = v_from10
    ORDER BY updated_at DESC NULLS LAST
    LIMIT 1;
  END IF;

  IF v_lead IS NULL OR v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_lead', 'from10', v_from10, 'to10', v_to10);
  END IF;

  IF upper(btrim(p_body)) IN ('STOP', 'UNSUBSCRIBE', 'CANCEL', 'QUIT', 'END') THEN
    UPDATE leads SET sms_opt_out = true WHERE id = v_lead;
  END IF;

  -- Reply kills any pending drip sends to this lead, and flags sent ones as replied
  UPDATE sms_drip_sends
  SET sms_status = 'replied'
  WHERE lead_id = v_lead AND sms_status IN ('queued', 'scheduled', 'sending', 'sent');

  SELECT id, unread_count INTO v_conv, v_unread
  FROM inbox_conversations
  WHERE user_id = v_user AND lead_id = v_lead;

  IF v_conv IS NULL THEN
    INSERT INTO inbox_conversations (user_id, lead_id, last_message_at, last_message_preview, last_direction, unread_count, last_inbound_at)
    VALUES (v_user, v_lead, now(), v_preview, 'inbound', 1, now())
    RETURNING id INTO v_conv;
  ELSE
    UPDATE inbox_conversations
    SET last_message_at = now(),
        last_message_preview = v_preview,
        last_direction = 'inbound',
        unread_count = coalesce(unread_count, 0) + 1,
        last_inbound_at = now()
    WHERE id = v_conv;
  END IF;

  IF p_sid IS NULL OR btrim(p_sid) = '' OR NOT EXISTS (
    SELECT 1 FROM inbox_messages WHERE twilio_sid = p_sid
  ) THEN
    INSERT INTO inbox_messages (conversation_id, lead_id, direction, body, status, sent_by, twilio_sid)
    VALUES (v_conv, v_lead, 'inbound', p_body, 'received', 'user', nullif(btrim(p_sid), ''));
  END IF;

  RETURN jsonb_build_object('ok', true, 'lead_id', v_lead, 'conversation_id', v_conv, 'user_id', v_user);
END;
$$;

REVOKE ALL ON FUNCTION ingest_inbound_sms(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ingest_inbound_sms(text, text, text, text) TO anon, authenticated, service_role;
