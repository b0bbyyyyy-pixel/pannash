-- Next scheduled follow-up date for the Pipeline table.
-- Run once in Supabase → SQL Editor.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS follow_up_at DATE;
