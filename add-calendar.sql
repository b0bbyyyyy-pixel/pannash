-- Calendar events + day notes tables.
-- Run this ONCE in Supabase → SQL Editor.

-- ── calendar_events ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS calendar_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date         DATE NOT NULL,            -- YYYY-MM-DD, stored as a real DATE
  title        TEXT NOT NULL,
  notes        TEXT,
  color        TEXT NOT NULL DEFAULT 'blue',
  alert_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  alert_at     TIMESTAMPTZ,
  alert_phone  TEXT,
  alert_sent   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast per-user monthly queries
CREATE INDEX IF NOT EXISTS idx_calendar_events_user_date
  ON calendar_events (user_id, date);

-- RLS
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own calendar events" ON calendar_events;
CREATE POLICY "Users manage own calendar events"
  ON calendar_events FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── calendar_day_notes ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS calendar_day_notes (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date      DATE NOT NULL,
  notes     TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_calendar_day_notes_user_date
  ON calendar_day_notes (user_id, date);

ALTER TABLE calendar_day_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own day notes" ON calendar_day_notes;
CREATE POLICY "Users manage own day notes"
  ON calendar_day_notes FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
