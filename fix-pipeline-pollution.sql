-- Campaign uploads leaked into the pipeline because leads.month_key has a
-- DEFAULT of the current month (from add-crm-columns.sql), and the pipeline
-- shows any lead with a month_key. Fix in two steps. Safe to re-run.

-- 1) Remove the bad default so future inserts don't get auto-stamped
ALTER TABLE leads ALTER COLUMN month_key DROP DEFAULT;

-- 2) Pull campaign/list leads back out of the pipeline.
--    Real pipeline leads have list_id = NULL (promote-to-crm clears it),
--    so this only touches leads that belong to an uploaded campaign.
UPDATE leads
SET month_key = NULL,
    in_pipeline = FALSE
WHERE list_id IS NOT NULL;
