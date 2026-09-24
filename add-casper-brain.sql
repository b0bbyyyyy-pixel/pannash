-- Casper control panel + per-lead on/off + activity log.
-- Run in the Supabase SQL Editor. Does not change casper_enabled (GLOBAL).

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS casper_system_prompt TEXT,
  ADD COLUMN IF NOT EXISTS casper_capabilities JSONB
    DEFAULT '{"chat_sms":true,"email_application":true,"upload_docs_to_crm":false,"submit_deals_waterfall":false,"propose_deals":false}'::jsonb,
  ADD COLUMN IF NOT EXISTS casper_mission TEXT DEFAULT 'collect_app_and_banks';

-- NULL / true = allow when global is on. false = this lead off.
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS casper_enabled BOOLEAN;

CREATE TABLE IF NOT EXISTS casper_runs (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id        UUID REFERENCES leads(id) ON DELETE SET NULL,
  trigger        TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'ok',
  thinking       TEXT,
  actions        JSONB DEFAULT '[]'::jsonb,
  model          TEXT,
  input_summary  TEXT,
  output_summary TEXT,
  error          TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS casper_lead_state (
  lead_id       UUID PRIMARY KEY REFERENCES leads(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phase         TEXT NOT NULL DEFAULT 'chatting',
  last_run_id   UUID,
  paused_reason TEXT,
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE casper_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE casper_lead_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own casper_runs" ON casper_runs;
CREATE POLICY "Users manage own casper_runs"
  ON casper_runs FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own casper_lead_state" ON casper_lead_state;
CREATE POLICY "Users manage own casper_lead_state"
  ON casper_lead_state FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS casper_runs_user_created
  ON casper_runs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS casper_runs_lead
  ON casper_runs (lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS casper_lead_state_user
  ON casper_lead_state (user_id);

NOTIFY pgrst, 'reload schema';
