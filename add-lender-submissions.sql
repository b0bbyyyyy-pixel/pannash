-- ── Lender Submissions table ──────────────────────────────────────────────────
-- Tracks every "Send to Lender" action and its current status.
CREATE TABLE IF NOT EXISTS lender_submissions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  lead_id         uuid NOT NULL,            -- soft-ref to leads.id
  lender_id       uuid,                     -- soft-ref to lenders.id (nullable)
  lender_name     text NOT NULL,
  lender_email    text,
  status          text NOT NULL DEFAULT 'Sent',
  -- Sent | Awaiting Response | Needs Docs | Declined | Approved | Failed
  ai_response     text,                     -- AI-detected summary of lender reply
  documents_sent  jsonb DEFAULT '[]'::jsonb,-- [{id, name, file_path}]
  sent_by_name    text,                     -- display name of sender
  note            text,
  email_template_name text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- Index for fast per-lead queries
CREATE INDEX IF NOT EXISTS lender_submissions_lead_id_idx  ON lender_submissions(lead_id);
CREATE INDEX IF NOT EXISTS lender_submissions_user_id_idx  ON lender_submissions(user_id);

-- RLS
ALTER TABLE lender_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own submissions"
  ON lender_submissions FOR ALL
  USING (auth.uid() = user_id);

-- Auto-updated timestamp trigger
CREATE OR REPLACE FUNCTION update_lender_submissions_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER lender_submissions_updated_at
  BEFORE UPDATE ON lender_submissions
  FOR EACH ROW EXECUTE FUNCTION update_lender_submissions_updated_at();
