-- Add underwriting_data column to leads table
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS underwriting_data JSONB DEFAULT '{}'::jsonb;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_leads_underwriting_data ON leads USING gin(underwriting_data);

-- Example structure (for reference):
-- {
--   "timeInBusiness": 36,
--   "industry": "Restaurant",
--   "creditScore": 650,
--   "monthlyRevenue": 50000,
--   "requestedAmount": 100000,
--   "factorRate": 1.25,
--   "holdbackPercent": 10,
--   "paymentFrequency": "Daily",
--   "termMonths": 12,
--   "purposeOfFunds": "Equipment purchase",
--   "lastUpdated": "2026-04-17T..."
-- }
