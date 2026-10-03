-- Allow inbox texts to be marked Read after a reply (or Twilio RCS/WhatsApp read).
ALTER TABLE inbox_messages DROP CONSTRAINT IF EXISTS inbox_messages_status_check;
ALTER TABLE inbox_messages ADD CONSTRAINT inbox_messages_status_check
  CHECK (status IN ('queued', 'sent', 'delivered', 'read', 'failed', 'received'));
