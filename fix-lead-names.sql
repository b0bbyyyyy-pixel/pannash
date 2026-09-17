-- Repair lead names from earlier imports:
-- if the name is empty, a dash, or an email address, use the company name instead.
-- Safe to re-run.
UPDATE leads
SET name = company
WHERE company IS NOT NULL
  AND company != ''
  AND (
    name IS NULL
    OR name = ''
    OR name = '-'
    OR name = '—'
    OR name LIKE '%@%'
  );
