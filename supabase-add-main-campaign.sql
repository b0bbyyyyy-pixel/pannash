-- Add is_main column to campaigns table to mark the user's default campaign

ALTER TABLE campaigns 
ADD COLUMN IF NOT EXISTS is_main BOOLEAN DEFAULT false;

-- Create index for quick lookups
CREATE INDEX IF NOT EXISTS idx_campaigns_is_main ON campaigns(user_id, is_main);

-- Add comment
COMMENT ON COLUMN campaigns.is_main IS 'Marks this campaign as the user''s main/default campaign for landing page';

-- Ensure only one campaign per user can be main
-- This will be enforced in the API, but add a comment for reference
COMMENT ON COLUMN campaigns.is_main IS 'Only one campaign per user should have is_main=true at a time';
