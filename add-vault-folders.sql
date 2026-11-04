-- Folders in the document vault.
-- Run once in Supabase → SQL Editor.

ALTER TABLE document_vault
  ADD COLUMN IF NOT EXISTS folder TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_document_vault_folder
  ON document_vault (user_id, folder);
