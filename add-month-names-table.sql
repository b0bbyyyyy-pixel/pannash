-- Create table for custom month names
CREATE TABLE IF NOT EXISTS monthly_dashboards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month_key TEXT NOT NULL,
  custom_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, month_key)
);

-- Enable RLS
ALTER TABLE monthly_dashboards ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own monthly dashboards"
  ON monthly_dashboards FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own monthly dashboards"
  ON monthly_dashboards FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own monthly dashboards"
  ON monthly_dashboards FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own monthly dashboards"
  ON monthly_dashboards FOR DELETE
  USING (auth.uid() = user_id);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_monthly_dashboards_user_month ON monthly_dashboards(user_id, month_key);

COMMENT ON TABLE monthly_dashboards IS 'Custom names for monthly lead tracking dashboards';
