-- Number-level inbound call block list (same table outbound DNC already uses).
-- Run once in Supabase → SQL Editor if dnc_numbers is missing.

CREATE TABLE IF NOT EXISTS dnc_numbers (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  e164        TEXT NOT NULL,
  reason      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, e164)
);

ALTER TABLE dnc_numbers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Own dnc numbers" ON dnc_numbers;
CREATE POLICY "Own dnc numbers"
  ON dnc_numbers FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS dnc_numbers_lookup
  ON dnc_numbers (user_id, e164);
