-- Ingest inbound Twilio SMS even when the webhook has no user session (RLS).
-- Run once in Supabase SQL editor.

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

  SELECT id, unread_count INTO v_conv, v_unread
  FROM inbox_conversations
  WHERE user_id = v_user AND lead_id = v_lead;

  IF v_conv IS NULL THEN
    INSERT INTO inbox_conversations (user_id, lead_id, last_message_at, last_message_preview, last_direction, unread_count)
    VALUES (v_user, v_lead, now(), v_preview, 'inbound', 1)
    RETURNING id INTO v_conv;
  ELSE
    UPDATE inbox_conversations
    SET last_message_at = now(),
        last_message_preview = v_preview,
        last_direction = 'inbound',
        unread_count = coalesce(unread_count, 0) + 1
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
