-- Create contact history table
CREATE TABLE IF NOT EXISTS contact_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  contact_date TIMESTAMP WITH TIME ZONE NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add RLS policies
ALTER TABLE contact_history ENABLE ROW LEVEL SECURITY;

-- Users can only see their own contact history
CREATE POLICY "Users can view own contact history"
  ON contact_history FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own contact history
CREATE POLICY "Users can insert own contact history"
  ON contact_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own contact history
CREATE POLICY "Users can update own contact history"
  ON contact_history FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own contact history
CREATE POLICY "Users can delete own contact history"
  ON contact_history FOR DELETE
  USING (auth.uid() = user_id);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_contact_history_lead_id ON contact_history(lead_id);
CREATE INDEX IF NOT EXISTS idx_contact_history_user_id ON contact_history(user_id);
CREATE INDEX IF NOT EXISTS idx_contact_history_contact_date ON contact_history(contact_date DESC);
