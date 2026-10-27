-- Campaign / lead-list source category so insights and Optimized SMS
-- stay scoped to one kind of lead (AI Full Packs, New Data, …).
ALTER TABLE lead_lists
  ADD COLUMN IF NOT EXISTS source_category TEXT;
