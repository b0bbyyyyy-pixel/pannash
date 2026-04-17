-- Create text_templates table
CREATE TABLE IF NOT EXISTS text_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE text_templates ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own text templates" ON text_templates;
DROP POLICY IF EXISTS "Users can insert own text templates" ON text_templates;
DROP POLICY IF EXISTS "Users can update own text templates" ON text_templates;
DROP POLICY IF EXISTS "Users can delete own text templates" ON text_templates;

-- Create RLS policies
CREATE POLICY "Users can view own text templates" ON text_templates
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own text templates" ON text_templates
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own text templates" ON text_templates
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own text templates" ON text_templates
  FOR DELETE USING (auth.uid() = user_id);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_text_templates_user_id ON text_templates(user_id);
