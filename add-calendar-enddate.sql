-- Add end_date to calendar_events for multi-day event support.
-- Safe to run even if add-calendar.sql was already applied.
ALTER TABLE calendar_events
  ADD COLUMN IF NOT EXISTS end_date DATE;
