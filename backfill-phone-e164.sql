-- Backfill phone_e164 for existing leads so the Dialer can queue them.
-- Safe to re-run: only touches rows where phone_e164 is missing.
UPDATE leads
SET phone_e164 = CASE
  -- Already valid E.164
  WHEN phone ~ '^\+[1-9][0-9]{6,14}$'
    THEN phone
  -- 10-digit US/CA number → +1XXXXXXXXXX
  WHEN length(regexp_replace(phone, '\D', '', 'g')) = 10
    THEN '+1' || regexp_replace(phone, '\D', '', 'g')
  -- 11 digits starting with 1 → +1XXXXXXXXXX
  WHEN length(regexp_replace(phone, '\D', '', 'g')) = 11
       AND left(regexp_replace(phone, '\D', '', 'g'), 1) = '1'
    THEN '+' || regexp_replace(phone, '\D', '', 'g')
  ELSE NULL
END
WHERE phone IS NOT NULL
  AND (phone_e164 IS NULL OR phone_e164 = '');
