-- Add early payoff options column to client_offer_portals
-- Each entry: { days: number, amount: number }
-- "days" = how many days into the term the buyout applies
-- "amount" = the total buyout amount at the max offer amount
ALTER TABLE client_offer_portals
ADD COLUMN IF NOT EXISTS epo_options JSONB DEFAULT '[]'::jsonb;
