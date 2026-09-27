-- Store JPEG/PNG files received on an inbound text.
-- Run in the Supabase SQL editor.

ALTER TABLE inbox_messages
  ADD COLUMN IF NOT EXISTS media_items JSONB;
