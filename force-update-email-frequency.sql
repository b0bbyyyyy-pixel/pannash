-- Force update email_frequency to moderate for all users
UPDATE automation_settings
SET 
  email_frequency = '5-10',
  updated_at = NOW()
WHERE email_frequency != '5-10' OR email_frequency IS NULL;

-- Verify the update
SELECT 
  user_id,
  email_frequency,
  sms_frequency,
  updated_at
FROM automation_settings;
