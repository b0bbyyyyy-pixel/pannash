-- Follow-up timers from the lead card: due time, optional auto-text, calendar link.
-- Run once in Supabase → SQL Editor.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS follow_up_at DATE,
  ADD COLUMN IF NOT EXISTS follow_up_due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS follow_up_auto_text BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS follow_up_sms_body TEXT,
  ADD COLUMN IF NOT EXISTS follow_up_calendar_event_id UUID,
  ADD COLUMN IF NOT EXISTS follow_up_sms_sent_at TIMESTAMPTZ;

ALTER TABLE calendar_events
  ADD COLUMN IF NOT EXISTS lead_id UUID,
  ADD COLUMN IF NOT EXISTS type TEXT;

CREATE INDEX IF NOT EXISTS idx_leads_follow_up_due
  ON leads (user_id, follow_up_due_at)
  WHERE follow_up_due_at IS NOT NULL;

NOTIFY pgrst, 'reload schema';
