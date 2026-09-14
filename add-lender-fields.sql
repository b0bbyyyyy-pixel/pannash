-- ═══════════════════════════════════════════════════════════════
-- LENDER FIELDS MIGRATION
-- Adds new columns to the lenders table for the updated lender data.
-- Run once in Supabase SQL Editor.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE lenders
  -- Contact info
  ADD COLUMN IF NOT EXISTS email                        TEXT,
  ADD COLUMN IF NOT EXISTS cc_email                    TEXT,
  ADD COLUMN IF NOT EXISTS rep_name                    TEXT,
  ADD COLUMN IF NOT EXISTS contact_phone               TEXT,
  ADD COLUMN IF NOT EXISTS rep_direct_phone            TEXT,
  ADD COLUMN IF NOT EXISTS submission_method           TEXT,
  ADD COLUMN IF NOT EXISTS products                    TEXT,

  -- Active toggle (may already exist as is_active — this adds if missing)
  ADD COLUMN IF NOT EXISTS is_active                   BOOLEAN NOT NULL DEFAULT TRUE,

  -- Extended underwriting
  ADD COLUMN IF NOT EXISTS max_nsfs                    INT,
  ADD COLUMN IF NOT EXISTS max_withhold                INT,
  ADD COLUMN IF NOT EXISTS avg_daily_balance           NUMERIC,
  ADD COLUMN IF NOT EXISTS min_amount                  NUMERIC,
  ADD COLUMN IF NOT EXISTS max_amount                  NUMERIC,
  ADD COLUMN IF NOT EXISTS min_term_days               INT,
  ADD COLUMN IF NOT EXISTS max_term_days               INT,

  -- Acceptance flags
  ADD COLUMN IF NOT EXISTS accepts_mercury             BOOLEAN,
  ADD COLUMN IF NOT EXISTS accepts_nonprofit           BOOLEAN,
  ADD COLUMN IF NOT EXISTS accepts_defaults            BOOLEAN,
  ADD COLUMN IF NOT EXISTS accepts_sole_prop           BOOLEAN,
  ADD COLUMN IF NOT EXISTS does_buyout                 BOOLEAN,
  ADD COLUMN IF NOT EXISTS does_reverse_consolidation  BOOLEAN,

  -- Restrictions (full text strings from source)
  ADD COLUMN IF NOT EXISTS state_restrictions          TEXT,
  ADD COLUMN IF NOT EXISTS prohibited_industries       TEXT,
  ADD COLUMN IF NOT EXISTS preferred_industries        TEXT,
  ADD COLUMN IF NOT EXISTS industry_position_restrictions TEXT,

  -- Detailed notes
  ADD COLUMN IF NOT EXISTS other_requirements          TEXT;

-- Refresh the schema cache so PostgREST picks up new columns
NOTIFY pgrst, 'reload schema';
