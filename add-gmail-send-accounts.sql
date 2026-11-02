-- Multiple Gmail send mailboxes, each with its own signature.
-- Safe to run more than once.

ALTER TABLE email_connections
  DROP CONSTRAINT IF EXISTS email_connections_user_id_provider_key;

DROP INDEX IF EXISTS email_connections_user_id_provider_key;

ALTER TABLE email_connections
  ADD COLUMN IF NOT EXISTS email_signature TEXT;

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS preferred_send_connection_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS email_connections_user_gmail_mailbox
  ON email_connections (
    user_id,
    provider,
    lower(coalesce(nullif(from_email, ''), nullif(email, ''), id::text))
  )
  WHERE provider = 'gmail';

UPDATE email_connections c
SET email_signature = s.email_signature
FROM user_settings s
WHERE c.user_id = s.user_id
  AND c.provider = 'gmail'
  AND coalesce(c.email_signature, '') = ''
  AND coalesce(s.email_signature, '') <> '';

NOTIFY pgrst, 'reload schema';
