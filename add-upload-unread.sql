-- Unseen lead-uploaded applications / documents (navbar badge + inbox bump).
ALTER TABLE inbox_conversations
  ADD COLUMN IF NOT EXISTS unseen_application_count INT NOT NULL DEFAULT 0;

ALTER TABLE inbox_conversations
  ADD COLUMN IF NOT EXISTS unseen_documents_count INT NOT NULL DEFAULT 0;
