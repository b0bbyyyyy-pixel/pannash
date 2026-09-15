-- ── Lead Statuses table ───────────────────────────────────────────────────────
-- Stores per-user, ordered, color-coded pipeline statuses.
CREATE TABLE IF NOT EXISTS lead_statuses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  name        text NOT NULL,
  color       text NOT NULL DEFAULT '#6b6b6b',   -- text color
  bg_color    text NOT NULL DEFAULT '#f5f5f5',   -- badge background
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS lead_statuses_user_name_idx ON lead_statuses(user_id, name);
CREATE INDEX IF NOT EXISTS lead_statuses_user_order_idx ON lead_statuses(user_id, sort_order);

ALTER TABLE lead_statuses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own statuses"
  ON lead_statuses FOR ALL
  USING (auth.uid() = user_id);
