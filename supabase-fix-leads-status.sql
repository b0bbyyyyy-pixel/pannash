-- Add missing 'status' column to leads table if it doesn't exist
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'new';

-- Optional: Add check constraint for valid status values
-- ALTER TABLE leads
-- ADD CONSTRAINT leads_status_check 
-- CHECK (status IN ('new', 'contacted', 'qualified', 'converted', 'lost'));
