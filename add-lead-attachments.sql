-- Create table for storing file attachments linked to leads
-- This allows users to attach PDFs, images, documents to any lead column

CREATE TABLE IF NOT EXISTS lead_attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  column_field TEXT NOT NULL, -- which column this attachment belongs to (e.g., 'notes', 'offers')
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL, -- path in Supabase Storage
  file_size INTEGER NOT NULL, -- in bytes
  file_type TEXT NOT NULL, -- MIME type
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for fast lookups by lead and column
CREATE INDEX IF NOT EXISTS idx_lead_attachments_lead_column 
ON lead_attachments(lead_id, column_field);

-- Create index for user lookups
CREATE INDEX IF NOT EXISTS idx_lead_attachments_user 
ON lead_attachments(user_id);

-- Enable RLS
ALTER TABLE lead_attachments ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own attachments"
ON lead_attachments FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own attachments"
ON lead_attachments FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own attachments"
ON lead_attachments FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own attachments"
ON lead_attachments FOR DELETE
USING (auth.uid() = user_id);
