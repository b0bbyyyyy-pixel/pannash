-- Add month_key to dashboard_config to make configuration per-month instead of global
-- This allows each month tab to have its own stages, stats, columns, and templates

-- Drop the old unique constraint that doesn't include month_key
ALTER TABLE dashboard_config 
DROP CONSTRAINT IF EXISTS dashboard_config_user_id_config_type_key;

-- Add month_key column
ALTER TABLE dashboard_config 
ADD COLUMN IF NOT EXISTS month_key TEXT;

-- Create new unique constraint that includes month_key
-- This allows one config per (user, type, month) combination
CREATE UNIQUE INDEX IF NOT EXISTS idx_dashboard_config_unique 
ON dashboard_config(user_id, config_type, COALESCE(month_key, ''));

-- Create index for month-specific config lookups
CREATE INDEX IF NOT EXISTS idx_dashboard_config_month 
ON dashboard_config(user_id, config_type, month_key);

-- For existing configs, we'll keep them as global (null month_key)
-- New per-month configs will have a specific month_key
