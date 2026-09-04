-- ═══════════════════════════════════════════════════════════════
-- DIALER MIGRATION
-- Run once in Supabase SQL editor.
-- Adds dialer columns to existing `leads` table +
-- creates `dialer_calls` table.
-- ═══════════════════════════════════════════════════════════════

-- ── 1. New columns on `leads` ────────────────────────────────────

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS phone_e164          TEXT,
  ADD COLUMN IF NOT EXISTS timezone            TEXT,
  ADD COLUMN IF NOT EXISTS dnc                 BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS dialer_status       TEXT,       -- null | 'bad_number' | 'do_not_contact'
  ADD COLUMN IF NOT EXISTS next_eligible_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_disposition    TEXT,
  ADD COLUMN IF NOT EXISTS last_called_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_call_notes     TEXT,
  ADD COLUMN IF NOT EXISTS attempts_today      INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS attempts_today_on   DATE,       -- date of attempts_today (lead tz)
  ADD COLUMN IF NOT EXISTS locked_by           UUID,       -- agent user_id
  ADD COLUMN IF NOT EXISTS locked_at           TIMESTAMPTZ;

-- ── 2. Back-fill phone_e164 from existing phone column ───────────
-- US normalization: 10-digit → +1XXXXXXXXXX, 11-digit starting 1 → +1XXXXXXXXXX
UPDATE leads
SET phone_e164 =
  CASE
    WHEN phone ~ '^\+[1-9][0-9]{6,14}$'
      THEN phone
    WHEN length(regexp_replace(phone, '[^0-9]', '', 'g')) = 10
      THEN '+1' || regexp_replace(phone, '[^0-9]', '', 'g')
    WHEN length(regexp_replace(phone, '[^0-9]', '', 'g')) = 11
      AND left(regexp_replace(phone, '[^0-9]', '', 'g'), 1) = '1'
      THEN '+' || regexp_replace(phone, '[^0-9]', '', 'g')
    ELSE NULL
  END
WHERE phone IS NOT NULL
  AND phone_e164 IS NULL;

-- ── 3. dialer_calls table ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dialer_calls (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id         UUID NOT NULL,
  agent_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_name       TEXT,
  to_number       TEXT NOT NULL,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at        TIMESTAMPTZ,
  disposition     TEXT,       -- connected | voicemail | no_answer | busy | bad_number | dnc | callback
  notes           TEXT,
  callback_at     TIMESTAMPTZ
);

ALTER TABLE dialer_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agents see own calls"
  ON dialer_calls FOR ALL
  USING (auth.uid() = agent_id)
  WITH CHECK (auth.uid() = agent_id);

CREATE INDEX IF NOT EXISTS dialer_calls_agent_started
  ON dialer_calls (agent_id, started_at DESC);

CREATE INDEX IF NOT EXISTS dialer_calls_lead
  ON dialer_calls (lead_id, started_at DESC);

-- ── 4. Index for fast queue queries ─────────────────────────────
CREATE INDEX IF NOT EXISTS leads_dialer_queue
  ON leads (user_id, next_eligible_at ASC NULLS FIRST)
  WHERE dnc = FALSE
    AND (dialer_status IS NULL OR dialer_status NOT IN ('bad_number','do_not_contact'))
    AND phone_e164 IS NOT NULL;
