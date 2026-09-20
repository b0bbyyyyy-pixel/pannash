-- If you already ran add-calendar-planner.sql, run this too.
ALTER TABLE calendar_day_notes
  ADD COLUMN IF NOT EXISTS slots JSONB NOT NULL DEFAULT '{}'::jsonb;
