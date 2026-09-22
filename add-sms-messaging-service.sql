-- Optional: A2P / 10DLC Messaging Service SID for Twilio SMS.
-- After carrier approval, texts should go out through this service (MGxxxx),
-- not just the raw From number, or carriers silently drop them.
ALTER TABLE phone_connections
  ADD COLUMN IF NOT EXISTS messaging_service_sid TEXT;
