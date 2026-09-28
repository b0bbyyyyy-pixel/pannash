-- SMS drip failsafe: pause after 3 failed texts in a row, and match Twilio status callbacks.
-- Optional — the app still pauses without this, but pause_reason and SID matching need these columns.

ALTER TABLE sms_drip_jobs ADD COLUMN IF NOT EXISTS consecutive_failures INT NOT NULL DEFAULT 0;
ALTER TABLE sms_drip_jobs ADD COLUMN IF NOT EXISTS pause_reason TEXT;

ALTER TABLE sms_drip_sends ADD COLUMN IF NOT EXISTS twilio_sid TEXT;
CREATE INDEX IF NOT EXISTS idx_drip_sends_twilio_sid ON sms_drip_sends(twilio_sid) WHERE twilio_sid IS NOT NULL;
