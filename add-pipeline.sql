-- Add in_pipeline flag to leads table
ALTER TABLE leads ADD COLUMN IF NOT EXISTS in_pipeline BOOLEAN NOT NULL DEFAULT FALSE;
-- Backfill: anything already in a monthly dashboard (has month_key) is in pipeline
UPDATE leads SET in_pipeline = TRUE WHERE month_key IS NOT NULL AND month_key != '';
-- Add lead_status column to track pipeline-specific status
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_status TEXT;
-- Add assigned_to column
ALTER TABLE leads ADD COLUMN IF NOT EXISTS assigned_to TEXT;
-- Add temperature column  
ALTER TABLE leads ADD COLUMN IF NOT EXISTS temperature TEXT;
NOTIFY pgrst, 'reload schema';
