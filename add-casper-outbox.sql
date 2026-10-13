-- Casper scheduled SMS outbox. Replies are generated on inbound, then sent later
-- so they feel human (45s–5min). Run in the Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS casper_outbox (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id        UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  to_phone       TEXT NOT NULL,
  body           TEXT NOT NULL,
  send_at        TIMESTAMPTZ NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'sent', 'cancelled')),
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  thinking       TEXT,
  actions        JSONB DEFAULT '[]'::jsonb,
  phase          TEXT,
  input_summary  TEXT,
  model          TEXT,
  error          TEXT
);

-- One unsent reply per lead — a new inbound cancels/replaces the pending row.
CREATE UNIQUE INDEX IF NOT EXISTS casper_outbox_one_pending
  ON casper_outbox (lead_id) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS casper_outbox_due
  ON casper_outbox (status, send_at);

CREATE INDEX IF NOT EXISTS casper_outbox_user_pending
  ON casper_outbox (user_id, status, send_at);

ALTER TABLE casper_outbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own casper_outbox" ON casper_outbox;
CREATE POLICY "Users manage own casper_outbox"
  ON casper_outbox FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

NOTIFY pgrst, 'reload schema';
