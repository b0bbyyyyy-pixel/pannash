-- Store portal customization defaults per user so they sync across all devices.
-- This JSONB column holds all the settings from the "Customize & Preview" panel
-- (title, intro message, EPO options, term options, CTA text, etc.).
ALTER TABLE automation_settings
ADD COLUMN IF NOT EXISTS portal_defaults JSONB DEFAULT NULL;
