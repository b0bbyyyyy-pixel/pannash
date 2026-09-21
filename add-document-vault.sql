-- Shared document vault (per user, not per lead).
-- Run once in Supabase → SQL Editor.
-- Files are stored in the existing lead-attachments bucket at {user_id}/vault/...

CREATE TABLE IF NOT EXISTS document_vault (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name  TEXT NOT NULL,
  file_path  TEXT NOT NULL,
  file_size  INTEGER NOT NULL,
  file_type  TEXT NOT NULL DEFAULT 'application/octet-stream',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_document_vault_user
  ON document_vault (user_id, created_at DESC);

ALTER TABLE document_vault ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own vault" ON document_vault;
CREATE POLICY "Users manage own vault"
  ON document_vault FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
