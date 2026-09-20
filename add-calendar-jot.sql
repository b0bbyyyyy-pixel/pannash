-- Handwritten jot snapshot for a planner day.
-- Run once in Supabase → SQL Editor.

ALTER TABLE calendar_day_notes
  ADD COLUMN IF NOT EXISTS jot_image TEXT,
  ADD COLUMN IF NOT EXISTS jot_text TEXT NOT NULL DEFAULT '';
