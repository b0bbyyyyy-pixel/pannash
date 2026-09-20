-- Planner extras for the overhauled calendar.
-- Run once in Supabase → SQL Editor.

ALTER TABLE calendar_events
  ADD COLUMN IF NOT EXISTS start_time TEXT;

ALTER TABLE calendar_day_notes
  ADD COLUMN IF NOT EXISTS finished BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS tasks JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS slots JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS jot_image TEXT,
  ADD COLUMN IF NOT EXISTS jot_text TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS calendar_planner (
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month_key   TEXT NOT NULL,
  month_notes TEXT NOT NULL DEFAULT '',
  habits      JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, month_key)
);

ALTER TABLE calendar_planner ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own planner" ON calendar_planner;
CREATE POLICY "Users manage own planner"
  ON calendar_planner FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS calendar_week_planner (
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start      DATE NOT NULL,
  top_priorities  TEXT NOT NULL DEFAULT '',
  personal        TEXT NOT NULL DEFAULT '',
  work            TEXT NOT NULL DEFAULT '',
  coming_up       TEXT NOT NULL DEFAULT '',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, week_start)
);

ALTER TABLE calendar_week_planner ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own week planner" ON calendar_week_planner;
CREATE POLICY "Users manage own week planner"
  ON calendar_week_planner FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
