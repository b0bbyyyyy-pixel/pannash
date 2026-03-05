-- Check current frequency settings in database
SELECT 
  user_id,
  email_frequency,
  sms_frequency,
  daily_limit,
  sms_daily_limit,
  updated_at
FROM automation_settings
ORDER BY updated_at DESC;
