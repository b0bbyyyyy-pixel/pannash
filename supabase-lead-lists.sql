-- Create lead_lists table for organizing leads
CREATE TABLE IF NOT EXISTS lead_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add list_id to leads table
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS list_id UUID REFERENCES lead_lists(id) ON DELETE SET NULL;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_lead_lists_user_id ON lead_lists(user_id);
CREATE INDEX IF NOT EXISTS idx_leads_list_id ON leads(list_id);

-- RLS for lead_lists
ALTER TABLE lead_lists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own lead lists" ON lead_lists;
CREATE POLICY "Users can view their own lead lists"
  ON lead_lists FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own lead lists" ON lead_lists;
CREATE POLICY "Users can insert their own lead lists"
  ON lead_lists FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own lead lists" ON lead_lists;
CREATE POLICY "Users can update their own lead lists"
  ON lead_lists FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own lead lists" ON lead_lists;
CREATE POLICY "Users can delete their own lead lists"
  ON lead_lists FOR DELETE
  USING (auth.uid() = user_id);

-- Create a default "All Leads" list for existing users
-- This is optional but helps with migration
