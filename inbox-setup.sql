-- ============================================================
-- INBOX TEXTING SUITE — Database Setup
-- Run this in your Supabase SQL editor
-- ============================================================

-- 1. Per-lead conversation threads (1:1 SMS inbox)
CREATE TABLE IF NOT EXISTS inbox_conversations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id         UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  last_message_at TIMESTAMPTZ,
  last_message_preview TEXT,
  last_direction  TEXT CHECK (last_direction IN ('inbound', 'outbound')),
  unread_count    INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, lead_id)
);

-- 2. Individual messages
CREATE TABLE IF NOT EXISTS inbox_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES inbox_conversations(id) ON DELETE CASCADE,
  lead_id         UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  direction       TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  body            TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued','sent','delivered','failed','received')),
  sent_by         TEXT NOT NULL DEFAULT 'user'
                    CHECK (sent_by IN ('user','calvin','system')),
  twilio_sid      TEXT,
  error_message   TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Extend leads table
ALTER TABLE leads ADD COLUMN IF NOT EXISTS sms_opt_out BOOLEAN DEFAULT FALSE;

-- 4. RLS
ALTER TABLE inbox_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbox_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own inbox_conversations" ON inbox_conversations;
CREATE POLICY "Users manage own inbox_conversations" ON inbox_conversations
  FOR ALL USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users see own inbox_messages" ON inbox_messages;
CREATE POLICY "Users see own inbox_messages" ON inbox_messages
  FOR ALL USING (
    conversation_id IN (
      SELECT id FROM inbox_conversations WHERE user_id = auth.uid()
    )
  );

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_inbox_conv_user_lead     ON inbox_conversations(user_id, lead_id);
CREATE INDEX IF NOT EXISTS idx_inbox_conv_last_msg      ON inbox_conversations(user_id, last_message_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_inbox_msg_conversation   ON inbox_messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_inbox_msg_twilio_sid     ON inbox_messages(twilio_sid) WHERE twilio_sid IS NOT NULL;
