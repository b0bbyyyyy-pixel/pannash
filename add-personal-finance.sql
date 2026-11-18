-- Personal Finance tab on Calendar. Run in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS personal_finance (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  plan JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE personal_finance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own personal_finance" ON personal_finance;
CREATE POLICY "Users manage own personal_finance"
  ON personal_finance FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
