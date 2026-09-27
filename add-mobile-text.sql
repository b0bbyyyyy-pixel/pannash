-- Mobile Text settings + push subscription (one row per user).
-- Run in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS mobile_text_settings (
  user_id               UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_landing         BOOLEAN NOT NULL DEFAULT TRUE,
  web_push              BOOLEAN NOT NULL DEFAULT TRUE,
  sms_fallback          BOOLEAN NOT NULL DEFAULT FALSE,
  personal_alert_number TEXT,
  push_subscription     JSONB,
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE mobile_text_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own mobile text settings" ON mobile_text_settings;
CREATE POLICY "Users manage own mobile text settings" ON mobile_text_settings
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
