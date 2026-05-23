-- Migration: Add nte_console_pulls table for existing installations
-- Run this in the Supabase SQL Editor if you already have nte_pulls set up.

CREATE TABLE IF NOT EXISTS nte_console_pulls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now() NOT NULL,
  user_tag text NOT NULL,
  session_id uuid NOT NULL,
  server_region text NOT NULL DEFAULT 'EU' CHECK (server_region IN ('EU','NA','Asia')),
  pull_hour int NOT NULL CHECK (pull_hour BETWEEN 0 AND 23),
  pull_minute int NOT NULL CHECK (pull_minute BETWEEN 0 AND 59),
  pull_second int NOT NULL CHECK (pull_second IN (0,5,10,15,20,25,30,35,40,45,50,55)),
  time_source text NOT NULL CHECK (time_source IN ('auto','manual')),
  logged_client_at timestamptz NOT NULL,
  timezone_offset_minutes int NOT NULL,
  team_label text,
  notes text,
  has_flat_hp boolean NOT NULL DEFAULT false,
  has_flat_atk boolean NOT NULL DEFAULT false,
  has_flat_def boolean NOT NULL DEFAULT false,
  has_hp_pct boolean NOT NULL DEFAULT false,
  has_atk_pct boolean NOT NULL DEFAULT false,
  has_def_pct boolean NOT NULL DEFAULT false,
  has_dmg_pct boolean NOT NULL DEFAULT false,
  has_crit_rate boolean NOT NULL DEFAULT false,
  has_crit_dmg boolean NOT NULL DEFAULT false,
  has_break_intensity boolean NOT NULL DEFAULT false,
  has_cycle_intensity boolean NOT NULL DEFAULT false,
  is_dual_crit boolean GENERATED ALWAYS AS (
    has_crit_rate AND has_crit_dmg
  ) STORED
);

CREATE INDEX IF NOT EXISTS idx_console_pulls_created_at ON nte_console_pulls(created_at desc);
CREATE INDEX IF NOT EXISTS idx_console_pulls_logged_client_at ON nte_console_pulls(logged_client_at desc);
CREATE INDEX IF NOT EXISTS idx_console_pulls_session ON nte_console_pulls(session_id);
CREATE INDEX IF NOT EXISTS idx_console_pulls_server ON nte_console_pulls(server_region);

ALTER TABLE nte_console_pulls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous console inserts" ON nte_console_pulls
  FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "Allow anonymous console selects" ON nte_console_pulls
  FOR SELECT TO anon, authenticated USING (true);
