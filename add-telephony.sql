-- ═══════════════════════════════════════════════════════════════
-- TELEPHONY MIGRATION (Slice A: SIP click-to-call)
-- Run once in Supabase SQL editor.
-- Extends dialer_calls with Twilio voice columns and adds
-- telephony_settings + dnc_numbers tables.
-- Safe to re-run (IF NOT EXISTS everywhere).
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Extend dialer_calls for real Twilio voice calls ───────────
ALTER TABLE dialer_calls
  ADD COLUMN IF NOT EXISTS twilio_call_sid   TEXT,        -- SID of the agent (SIP) leg
  ADD COLUMN IF NOT EXISTS lead_call_sid     TEXT,        -- SID of the lead leg (child call)
  ADD COLUMN IF NOT EXISTS from_number       TEXT,        -- caller ID used
  ADD COLUMN IF NOT EXISTS direction         TEXT DEFAULT 'outbound',
  -- Lifecycle:
  -- dry_run | created | ringing_agent | agent_answered | in_progress
  -- | completed | no_answer | busy | failed | canceled | agent_no_answer
  ADD COLUMN IF NOT EXISTS status            TEXT DEFAULT 'created',
  ADD COLUMN IF NOT EXISTS answered_at       TIMESTAMPTZ, -- lead answered
  ADD COLUMN IF NOT EXISTS duration_seconds  INT,
  ADD COLUMN IF NOT EXISTS recording_url     TEXT,
  ADD COLUMN IF NOT EXISTS answering_machine BOOLEAN,
  ADD COLUMN IF NOT EXISTS raw_twilio_status JSONB;

CREATE INDEX IF NOT EXISTS dialer_calls_twilio_sid
  ON dialer_calls (twilio_call_sid);

-- ── 2. Per-user telephony settings ───────────────────────────────
-- NOTE: Twilio account_sid / auth_token / phone_number stay in the
-- existing phone_connections table (same as SMS). This table only
-- holds dialer behavior settings.
CREATE TABLE IF NOT EXISTS telephony_settings (
  user_id               UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  sip_uri               TEXT,                      -- e.g. sip:desk@yourdomain.sip.twilio.com
  wrap_seconds          INT  NOT NULL DEFAULT 2,
  record_calls          BOOLEAN NOT NULL DEFAULT FALSE,
  dry_run               BOOLEAN NOT NULL DEFAULT TRUE,  -- SAFE DEFAULT: log, don't dial
  calling_window_start  TEXT NOT NULL DEFAULT '09:00',  -- America/New_York
  calling_window_end    TEXT NOT NULL DEFAULT '20:00',
  max_attempts_per_day  INT  NOT NULL DEFAULT 3,
  compliance_ack        BOOLEAN NOT NULL DEFAULT FALSE, -- "I am responsible for TCPA/DNC"
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE telephony_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Own telephony settings" ON telephony_settings;
CREATE POLICY "Own telephony settings"
  ON telephony_settings FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── 3. DNC numbers table ─────────────────────────────────────────
-- leads.dnc boolean stays (fast per-lead flag). This table catches
-- a number across ALL leads that share it.
CREATE TABLE IF NOT EXISTS dnc_numbers (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  e164        TEXT NOT NULL,
  reason      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, e164)
);

ALTER TABLE dnc_numbers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Own dnc numbers" ON dnc_numbers;
CREATE POLICY "Own dnc numbers"
  ON dnc_numbers FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS dnc_numbers_lookup
  ON dnc_numbers (user_id, e164);

-- ── 4. Manual dialing: calls don't always belong to a lead ───────
ALTER TABLE dialer_calls ALTER COLUMN lead_id DROP NOT NULL;
