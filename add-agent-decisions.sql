-- Agent decisions table — the core of the Calvin-style Agent tab.
-- Each row is one decision card that can be approved, snoozed, or dismissed.

CREATE TABLE IF NOT EXISTS agent_decisions (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id         UUID,                  -- nullable (campaign-level cards have no single lead)
  lead_name       TEXT NOT NULL,
  company         TEXT,
  type            TEXT NOT NULL,         -- see types below
  status          TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | snoozed | dismissed | sent | paused
  priority        TEXT NOT NULL DEFAULT 'normal',   -- urgent | normal | low
  proposal        TEXT NOT NULL,         -- one-sentence agent proposal shown on the card
  draft_content   TEXT,                  -- the actual SMS/email copy (editable before send)
  draft_type      TEXT,                  -- 'sms' | 'email'
  conversation_id UUID,                  -- inbox_conversations.id — enables "Show conversation"
  metadata        JSONB DEFAULT '{}',    -- extra context: stage, campaign_id, score, etc.
  snooze_until    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  acted_at        TIMESTAMPTZ            -- when user took action
);

-- Card types reference:
--   suggest_reply     → AI drafted a reply to an inbound SMS
--   follow_up         → follow-up suggestion for a stalled lead
--   hot_lead          → hot-lead score spiked
--   stage_move        → suggest stage promotion (e.g. Offers → Proposal Sent)
--   campaign_reply    → inbound reply to a campaign blast
--   schedule_followup → propose adding a calendar follow-up
--   stalled           → lead gone quiet for N days

-- Row-level security
ALTER TABLE agent_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own decisions"
  ON agent_decisions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Index for fast pending-card lookups
CREATE INDEX IF NOT EXISTS agent_decisions_user_status
  ON agent_decisions (user_id, status, created_at DESC);
