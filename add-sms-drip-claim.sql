-- ============================================================
-- SMS DRIP — prevent double-texts (run in Supabase → SQL Editor)
-- Two browser tabs were able to send the same lead at once.
-- This adds an in-flight status, a row lock, and one live job per list.
-- The app also claims in code; this makes the database enforce it.
-- ============================================================

ALTER TABLE sms_drip_sends DROP CONSTRAINT IF EXISTS sms_drip_sends_sms_status_check;
ALTER TABLE sms_drip_sends ADD CONSTRAINT sms_drip_sends_sms_status_check
  CHECK (sms_status IN (
    'queued','scheduled','sending','sent','failed','replied',
    'skipped_tz','skipped_state','skipped_dnc','skipped_dup'
  ));

-- One live drip per campaign (blocks a second Start while one is active/paused)
CREATE UNIQUE INDEX IF NOT EXISTS idx_drip_jobs_one_live
  ON sms_drip_jobs(list_id)
  WHERE status IN ('active', 'paused');

CREATE OR REPLACE FUNCTION claim_drip_job_send(p_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_job sms_drip_jobs%ROWTYPE;
  v_send sms_drip_sends%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_job
  FROM sms_drip_jobs
  WHERE id = p_job_id
    AND user_id = v_user
    AND status = 'active'
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_job.next_send_at IS NOT NULL AND v_job.next_send_at > v_now THEN
    RETURN jsonb_build_object('job_claimed', false, 'reason', 'not_due');
  END IF;

  -- Reclaim claims that never finished (crash / killed tab)
  UPDATE sms_drip_sends
  SET sms_status = 'queued', scheduled_for = NULL, error = NULL
  WHERE job_id = p_job_id
    AND sms_status = 'sending'
    AND scheduled_for IS NOT NULL
    AND scheduled_for < v_now;

  SELECT * INTO v_send
  FROM sms_drip_sends
  WHERE job_id = p_job_id
    AND (
      (sms_status = 'scheduled' AND scheduled_for <= v_now)
      OR sms_status = 'queued'
    )
  ORDER BY CASE WHEN sms_status = 'scheduled' THEN 0 ELSE 1 END,
           scheduled_for NULLS LAST,
           position
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  UPDATE sms_drip_jobs
  SET next_send_at = v_now + interval '90 seconds',
      updated_at = v_now
  WHERE id = p_job_id;

  IF v_send.id IS NULL THEN
    RETURN jsonb_build_object('job_claimed', true, 'send', NULL);
  END IF;

  UPDATE sms_drip_sends
  SET sms_status = 'sending',
      scheduled_for = v_now + interval '90 seconds',
      error = NULL
  WHERE id = v_send.id
  RETURNING * INTO v_send;

  RETURN jsonb_build_object(
    'job_claimed', true,
    'send', jsonb_build_object(
      'id', v_send.id,
      'lead_id', v_send.lead_id,
      'position', v_send.position,
      'phone', v_send.phone
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION claim_drip_job_send(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_drip_job_send(uuid) TO authenticated;
