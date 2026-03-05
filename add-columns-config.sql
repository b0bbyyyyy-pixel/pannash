-- Add default column configuration for existing users
-- This allows users to customize column names and widths

INSERT INTO dashboard_config (user_id, config_type, config_data)
SELECT 
  id as user_id,
  'columns',
  '[
    {"field": "timer", "label": "Timer", "width": 120, "visible": true},
    {"field": "company", "label": "Opportunity", "width": 150, "visible": true},
    {"field": "name", "label": "Name", "width": 150, "visible": true},
    {"field": "stage", "label": "Stage", "width": 160, "visible": true},
    {"field": "value", "label": "Value", "width": 100, "visible": true},
    {"field": "email", "label": "E-Mail", "width": 180, "visible": true},
    {"field": "phone", "label": "Phone", "width": 120, "visible": true},
    {"field": "lead_source", "label": "Lead Source", "width": 120, "visible": true},
    {"field": "last_contact", "label": "Last Contact", "width": 120, "visible": true},
    {"field": "notes", "label": "Notes", "width": 150, "visible": true},
    {"field": "offers", "label": "Offers", "width": 150, "visible": true},
    {"field": "auto_email_frequency", "label": "Auto Email", "width": 140, "visible": true},
    {"field": "auto_text_frequency", "label": "Auto Text", "width": 140, "visible": true}
  ]'::jsonb
FROM auth.users
ON CONFLICT (user_id, config_type) DO NOTHING;

-- Verify the insert
SELECT 
  config_type,
  config_data
FROM dashboard_config
WHERE config_type = 'columns'
LIMIT 1;
