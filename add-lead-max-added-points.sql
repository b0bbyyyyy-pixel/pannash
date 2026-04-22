-- Run once in Supabase SQL Editor.
-- 1) Adds the column. All existing leads get 50 (DEFAULT) until you change them.
-- 2) New leads created via the app "Add Lead" + create-crm API get the value from the form.

ALTER TABLE leads
ADD COLUMN IF NOT EXISTS max_added_points INTEGER NOT NULL DEFAULT 50
  CHECK (max_added_points >= 1 AND max_added_points <= 50);

COMMENT ON COLUMN leads.max_added_points IS 'Upper bound for added commission points in Underwriting (1–50).';

-- Optional: fix one lead where the default 50 is wrong (replace id and 12 with your values).
-- UPDATE leads SET max_added_points = 12 WHERE id = '00000000-0000-0000-0000-000000000000';

-- Optional: you cannot "guess" the right cap for every old lead in bulk. Either update by id,
-- or re-save each lead in the product after the app has written the column from Add Lead.
