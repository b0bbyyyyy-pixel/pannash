-- Email Tracking Schema for Phase 3

-- 1. EMAIL EVENTS TABLE
-- Tracks opens, clicks, and other email events
CREATE TABLE IF NOT EXISTS email_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_lead_id UUID NOT NULL REFERENCES campaign_leads(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('opened', 'clicked', 'replied', 'bounced', 'unsubscribed')),
  event_data JSONB, -- Additional data (clicked link, user agent, etc.)
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. FOLLOW_UPS TABLE
-- Stores AI-generated follow-up emails
CREATE TABLE IF NOT EXISTS follow_ups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_lead_id UUID NOT NULL REFERENCES campaign_leads(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  email_body TEXT NOT NULL,
  ai_reasoning TEXT, -- Why AI decided to send this follow-up
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'cancelled')),
  scheduled_for TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. HOT LEADS TABLE
-- Flags high-engagement leads for manual follow-up
CREATE TABLE IF NOT EXISTS hot_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_lead_id UUID NOT NULL REFERENCES campaign_leads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  engagement_score INTEGER DEFAULT 0, -- Calculate based on opens, clicks, replies
  reason TEXT, -- Why this is flagged as hot (e.g., "Replied with interest", "Opened 3x")
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'closed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(campaign_lead_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_email_events_campaign_lead_id ON email_events(campaign_lead_id);
CREATE INDEX IF NOT EXISTS idx_email_events_event_type ON email_events(event_type);
CREATE INDEX IF NOT EXISTS idx_follow_ups_campaign_lead_id ON follow_ups(campaign_lead_id);
CREATE INDEX IF NOT EXISTS idx_follow_ups_status ON follow_ups(status);
CREATE INDEX IF NOT EXISTS idx_hot_leads_user_id ON hot_leads(user_id);
CREATE INDEX IF NOT EXISTS idx_hot_leads_status ON hot_leads(status);

-- Row Level Security (RLS)
ALTER TABLE email_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE follow_ups ENABLE ROW LEVEL SECURITY;
ALTER TABLE hot_leads ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own email events" ON email_events;
DROP POLICY IF EXISTS "Users can insert their own email events" ON email_events;
DROP POLICY IF EXISTS "Users can view their own follow ups" ON follow_ups;
DROP POLICY IF EXISTS "Users can insert their own follow ups" ON follow_ups;
DROP POLICY IF EXISTS "Users can update their own follow ups" ON follow_ups;
DROP POLICY IF EXISTS "Users can view their own hot leads" ON hot_leads;
DROP POLICY IF EXISTS "Users can insert their own hot leads" ON hot_leads;
DROP POLICY IF EXISTS "Users can update their own hot leads" ON hot_leads;
DROP POLICY IF EXISTS "Users can delete their own hot leads" ON hot_leads;

-- RLS Policies for email_events
CREATE POLICY "Users can view their own email events"
  ON email_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM campaign_leads
      JOIN campaigns ON campaigns.id = campaign_leads.campaign_id
      WHERE campaign_leads.id = email_events.campaign_lead_id
      AND campaigns.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their own email events"
  ON email_events FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM campaign_leads
      JOIN campaigns ON campaigns.id = campaign_leads.campaign_id
      WHERE campaign_leads.id = email_events.campaign_lead_id
      AND campaigns.user_id = auth.uid()
    )
  );

-- RLS Policies for follow_ups
CREATE POLICY "Users can view their own follow ups"
  ON follow_ups FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM campaign_leads
      JOIN campaigns ON campaigns.id = campaign_leads.campaign_id
      WHERE campaign_leads.id = follow_ups.campaign_lead_id
      AND campaigns.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their own follow ups"
  ON follow_ups FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM campaign_leads
      JOIN campaigns ON campaigns.id = campaign_leads.campaign_id
      WHERE campaign_leads.id = follow_ups.campaign_lead_id
      AND campaigns.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their own follow ups"
  ON follow_ups FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM campaign_leads
      JOIN campaigns ON campaigns.id = campaign_leads.campaign_id
      WHERE campaign_leads.id = follow_ups.campaign_lead_id
      AND campaigns.user_id = auth.uid()
    )
  );

-- RLS Policies for hot_leads
CREATE POLICY "Users can view their own hot leads"
  ON hot_leads FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own hot leads"
  ON hot_leads FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own hot leads"
  ON hot_leads FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own hot leads"
  ON hot_leads FOR DELETE
  USING (auth.uid() = user_id);
