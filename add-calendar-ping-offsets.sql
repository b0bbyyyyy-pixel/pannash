-- Multiple Ping-me offsets on calendar events (30m / 1h / 2h / 3h).
ALTER TABLE calendar_events
  ADD COLUMN IF NOT EXISTS alert_schedule JSONB;
