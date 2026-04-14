-- Add auto frequencies configuration table and last-sent timestamps

-- Create auto_frequencies table for customizable email/text frequencies
CREATE TABLE IF NOT EXISTS public.auto_frequencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  days_interval INTEGER NOT NULL,
  bg_color TEXT NOT NULL DEFAULT '#d5f0d5',
  text_color TEXT NOT NULL DEFAULT '#2a5a2a',
  type TEXT NOT NULL CHECK (type IN ('email', 'text', 'both')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.auto_frequencies ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own auto frequencies"
  ON public.auto_frequencies FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own auto frequencies"
  ON public.auto_frequencies FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own auto frequencies"
  ON public.auto_frequencies FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own auto frequencies"
  ON public.auto_frequencies FOR DELETE
  USING (auth.uid() = user_id);

-- Add last-sent timestamp columns to leads table
ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS last_email_sent TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_text_sent TIMESTAMPTZ;

-- Insert default frequencies for existing users
INSERT INTO public.auto_frequencies (user_id, name, days_interval, bg_color, text_color, type)
SELECT 
  id as user_id,
  'Off' as name,
  0 as days_interval,
  '#f5f5f5' as bg_color,
  '#999999' as text_color,
  'both' as type
FROM auth.users
ON CONFLICT DO NOTHING;

INSERT INTO public.auto_frequencies (user_id, name, days_interval, bg_color, text_color, type)
SELECT 
  id as user_id,
  'Everyday' as name,
  1 as days_interval,
  '#d5f0d5' as bg_color,
  '#2a5a2a' as text_color,
  'both' as type
FROM auth.users
ON CONFLICT DO NOTHING;

INSERT INTO public.auto_frequencies (user_id, name, days_interval, bg_color, text_color, type)
SELECT 
  id as user_id,
  'Every Other Day' as name,
  2 as days_interval,
  '#d5e8f0' as bg_color,
  '#2a3a5a' as text_color,
  'both' as type
FROM auth.users
ON CONFLICT DO NOTHING;

INSERT INTO public.auto_frequencies (user_id, name, days_interval, bg_color, text_color, type)
SELECT 
  id as user_id,
  'Every 30 Days' as name,
  30 as days_interval,
  '#e5d5e8' as bg_color,
  '#4a3a5a' as text_color,
  'both' as type
FROM auth.users
ON CONFLICT DO NOTHING;
