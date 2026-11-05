-- Brand on Create Application PDFs (One Funding Solution vs American Business Funding).
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS application_brand TEXT DEFAULT 'oneFunding';
