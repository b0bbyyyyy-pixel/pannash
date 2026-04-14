-- Add position column to campaign_leads for custom ordering

ALTER TABLE campaign_leads
ADD COLUMN IF NOT EXISTS position INTEGER DEFAULT 0;

-- Set initial positions based on created_at order for each campaign
WITH ranked AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (PARTITION BY campaign_id ORDER BY created_at ASC) - 1 as new_position
  FROM campaign_leads
)
UPDATE campaign_leads
SET position = ranked.new_position
FROM ranked
WHERE campaign_leads.id = ranked.id;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_campaign_leads_position 
ON campaign_leads(campaign_id, position);

-- Verify the positions
SELECT 
  campaign_id,
  id,
  position,
  status,
  created_at
FROM campaign_leads
ORDER BY campaign_id, position ASC
LIMIT 20;
