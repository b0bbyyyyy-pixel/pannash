-- Campaign replies belong on the main Inbox (last_inbound_at), not only the campaign list.
-- STOP stays DNC and off Inbox. Safe to run more than once.

ALTER TABLE inbox_conversations ADD COLUMN IF NOT EXISTS last_inbound_at TIMESTAMPTZ;

-- Backfill: any real inbound (not STOP) should show on Inbox.
UPDATE inbox_conversations c
SET last_inbound_at = coalesce(c.last_inbound_at, c.last_message_at, now())
WHERE c.last_inbound_at IS NULL
  AND (
    c.last_direction = 'inbound'
    OR EXISTS (
      SELECT 1 FROM inbox_messages m
      WHERE m.lead_id = c.lead_id
        AND m.direction = 'inbound'
        AND upper(btrim(regexp_replace(coalesce(m.body, ''), '[^A-Za-z]', '', 'g')))
          NOT IN ('STOP', 'UNSUBSCRIBE', 'CANCEL', 'QUIT', 'END')
    )
  )
  AND upper(btrim(regexp_replace(coalesce(c.last_message_preview, ''), '[^A-Za-z]', '', 'g')))
    NOT IN ('STOP', 'UNSUBSCRIBE', 'CANCEL', 'QUIT', 'END');

-- STOP / DNC threads stay off Inbox and don't keep the tab red.
UPDATE inbox_conversations c
SET last_inbound_at = NULL,
    unread_count = 0
WHERE upper(btrim(regexp_replace(coalesce(c.last_message_preview, ''), '[^A-Za-z]', '', 'g')))
    IN ('STOP', 'UNSUBSCRIBE', 'CANCEL', 'QUIT', 'END')
  AND NOT EXISTS (
    SELECT 1 FROM inbox_messages m
    WHERE m.lead_id = c.lead_id
      AND m.direction = 'inbound'
      AND upper(btrim(regexp_replace(coalesce(m.body, ''), '[^A-Za-z]', '', 'g')))
        NOT IN ('STOP', 'UNSUBSCRIBE', 'CANCEL', 'QUIT', 'END')
  );

UPDATE inbox_conversations c
SET unread_count = 0
FROM leads l
WHERE l.id = c.lead_id
  AND (l.sms_opt_out = true OR upper(coalesce(l.lead_status, '')) = 'DNC');

NOTIFY pgrst, 'reload schema';
