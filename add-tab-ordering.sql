-- Add order column to monthly_dashboards for drag-and-drop tab reordering
ALTER TABLE monthly_dashboards 
ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0;

-- Create index for ordering
CREATE INDEX IF NOT EXISTS idx_monthly_dashboards_order 
ON monthly_dashboards(user_id, display_order);

-- Set initial order based on created_at for existing tabs
WITH ordered_tabs AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at) as new_order
  FROM monthly_dashboards
)
UPDATE monthly_dashboards
SET display_order = ordered_tabs.new_order
FROM ordered_tabs
WHERE monthly_dashboards.id = ordered_tabs.id;
