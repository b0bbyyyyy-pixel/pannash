-- STOP / STOP-only replies: DNC, keep the thread on the campaign list,
-- do not bump Inbox (last_inbound_at) or promote to Prospect.
-- Run once in Supabase → SQL Editor.

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
  v_list uuid;
  v_in_pipeline boolean;
  v_status text;
  v_is_stop boolean;
  v_has_real_inbound boolean;
BEGIN
  IF p_from IS NULL OR btrim(p_from) = '' OR p_body IS NULL OR btrim(p_body) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_from_or_body');
  END IF;

  v_from10 := right(regexp_replace(coalesce(p_from, ''), '\D', '', 'g'), 10);
  v_to10 := right(regexp_replace(coalesce(p_to, ''), '\D', '', 'g'), 10);
  v_preview := left(p_body, 100);
  v_is_stop := upper(btrim(regexp_replace(coalesce(p_body, ''), '[^A-Za-z]', '', 'g')))
    IN ('STOP', 'UNSUBSCRIBE', 'CANCEL', 'QUIT', 'END');

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

  IF v_is_stop THEN
    INSERT INTO lead_statuses (user_id, name, color, bg_color, sort_order)
    SELECT v_user, 'DNC', '#7f1d1d', '#fee2e2',
           coalesce((SELECT max(sort_order) FROM lead_statuses WHERE user_id = v_user), -1) + 1
    WHERE NOT EXISTS (
      SELECT 1 FROM lead_statuses s WHERE s.user_id = v_user AND s.name = 'DNC'
    );

    UPDATE leads
    SET sms_opt_out = true,
        lead_status = 'DNC'
    WHERE id = v_lead;
  END IF;

  UPDATE sms_drip_sends
  SET sms_status = 'replied'
  WHERE lead_id = v_lead AND sms_status IN ('queued', 'scheduled', 'sending', 'sent');

  SELECT EXISTS (
    SELECT 1 FROM inbox_messages
    WHERE lead_id = v_lead
      AND direction = 'inbound'
      AND upper(btrim(regexp_replace(coalesce(body, ''), '[^A-Za-z]', '', 'g')))
        NOT IN ('STOP', 'UNSUBSCRIBE', 'CANCEL', 'QUIT', 'END')
  ) INTO v_has_real_inbound;

  SELECT id, unread_count INTO v_conv, v_unread
  FROM inbox_conversations
  WHERE user_id = v_user AND lead_id = v_lead;

  IF v_conv IS NULL THEN
    INSERT INTO inbox_conversations (
      user_id, lead_id, last_message_at, last_message_preview, last_direction, unread_count, last_inbound_at
    )
    VALUES (
      v_user, v_lead, now(), v_preview, 'inbound',
      CASE WHEN v_is_stop THEN 0 ELSE 1 END,
      CASE WHEN v_is_stop THEN NULL ELSE now() END
    )
    RETURNING id INTO v_conv;
  ELSE
    UPDATE inbox_conversations
    SET last_message_at = now(),
        last_message_preview = v_preview,
        last_direction = 'inbound',
        unread_count = CASE
          WHEN v_is_stop THEN coalesce(unread_count, 0)
          ELSE coalesce(unread_count, 0) + 1
        END,
        last_inbound_at = CASE
          WHEN v_is_stop AND NOT v_has_real_inbound THEN NULL
          WHEN v_is_stop THEN last_inbound_at
          ELSE now()
        END
    WHERE id = v_conv;
  END IF;

  IF p_sid IS NULL OR btrim(p_sid) = '' OR NOT EXISTS (
    SELECT 1 FROM inbox_messages WHERE twilio_sid = p_sid
  ) THEN
    INSERT INTO inbox_messages (conversation_id, lead_id, direction, body, status, sent_by, twilio_sid)
    VALUES (v_conv, v_lead, 'inbound', p_body, 'received', 'user', nullif(btrim(p_sid), ''));
  END IF;

  IF v_is_stop AND NOT v_has_real_inbound THEN
    UPDATE inbox_conversations SET last_inbound_at = NULL WHERE id = v_conv;
  END IF;

  -- Campaign lead, not yet in pipeline, no real status → Prospect (never on STOP)
  IF NOT v_is_stop THEN
    SELECT list_id, in_pipeline, lead_status INTO v_list, v_in_pipeline, v_status
    FROM leads WHERE id = v_lead;

    IF v_list IS NOT NULL
       AND coalesce(v_in_pipeline, false) = false
       AND (v_status IS NULL OR btrim(v_status) = '' OR v_status = 'New Lead') THEN
      UPDATE leads
      SET lead_status = 'Prospect',
          in_pipeline = true
      WHERE id = v_lead;
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'lead_id', v_lead, 'conversation_id', v_conv, 'user_id', v_user, 'stop', v_is_stop);
END;
$$;

REVOKE ALL ON FUNCTION ingest_inbound_sms(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ingest_inbound_sms(text, text, text, text) TO anon, authenticated, service_role;

-- Hide existing STOP-only threads from Inbox (they stay on the campaign list).
UPDATE inbox_conversations c
SET last_inbound_at = NULL
WHERE last_direction = 'inbound'
  AND upper(btrim(regexp_replace(coalesce(last_message_preview, ''), '[^A-Za-z]', '', 'g')))
    IN ('STOP', 'UNSUBSCRIBE', 'CANCEL', 'QUIT', 'END')
  AND NOT EXISTS (
    SELECT 1 FROM inbox_messages m
    WHERE m.lead_id = c.lead_id
      AND m.direction = 'inbound'
      AND upper(btrim(regexp_replace(coalesce(m.body, ''), '[^A-Za-z]', '', 'g')))
        NOT IN ('STOP', 'UNSUBSCRIBE', 'CANCEL', 'QUIT', 'END')
  );

UPDATE leads l
SET sms_opt_out = true,
    lead_status = 'DNC'
WHERE EXISTS (
  SELECT 1 FROM inbox_messages m
  WHERE m.lead_id = l.id
    AND m.direction = 'inbound'
    AND upper(btrim(regexp_replace(coalesce(m.body, ''), '[^A-Za-z]', '', 'g')))
      IN ('STOP', 'UNSUBSCRIBE', 'CANCEL', 'QUIT', 'END')
)
AND NOT EXISTS (
  SELECT 1 FROM inbox_messages m
  WHERE m.lead_id = l.id
    AND m.direction = 'inbound'
    AND upper(btrim(regexp_replace(coalesce(m.body, ''), '[^A-Za-z]', '', 'g')))
      NOT IN ('STOP', 'UNSUBSCRIBE', 'CANCEL', 'QUIT', 'END')
);
