-- Add og_site_name column to client_offer_portals
-- This controls the brand/site name shown in iMessage link previews
-- (displayed below the description line in the preview card)
ALTER TABLE client_offer_portals
ADD COLUMN IF NOT EXISTS og_site_name TEXT DEFAULT NULL;
