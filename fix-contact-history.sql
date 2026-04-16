-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Users can view own contact history" ON contact_history;
DROP POLICY IF EXISTS "Users can insert own contact history" ON contact_history;
DROP POLICY IF EXISTS "Users can update own contact history" ON contact_history;
DROP POLICY IF EXISTS "Users can delete own contact history" ON contact_history;

-- Recreate policies
CREATE POLICY "Users can view own contact history"
  ON contact_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own contact history"
  ON contact_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own contact history"
  ON contact_history FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own contact history"
  ON contact_history FOR DELETE
  USING (auth.uid() = user_id);

-- Verify RLS is enabled
ALTER TABLE contact_history ENABLE ROW LEVEL SECURITY;
