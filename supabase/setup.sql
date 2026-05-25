-- NTE PRNG Logger — Database Schema

CREATE TABLE IF NOT EXISTS nte_pulls (
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
  batch_size int NOT NULL DEFAULT 1,
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

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_nte_pulls_created_at ON nte_pulls(created_at desc);
CREATE INDEX IF NOT EXISTS idx_nte_pulls_logged_client_at ON nte_pulls(logged_client_at desc);
CREATE INDEX IF NOT EXISTS idx_nte_pulls_session ON nte_pulls(session_id);
CREATE INDEX IF NOT EXISTS idx_nte_pulls_server ON nte_pulls(server_region);

-- Row Level Security
ALTER TABLE nte_pulls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous inserts" ON nte_pulls
  FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "Allow anonymous selects" ON nte_pulls
  FOR SELECT TO anon, authenticated USING (true);

-- Console (stamina) pulls table — same shape, separate storage
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
  batch_size int NOT NULL DEFAULT 1,
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
  main_stat text CHECK (main_stat IN (
    'HP Bonus','ATK Bonus','DEF Bonus','CRIT Rate','CRIT DMG',
    'Cycle Intensity','Break Intensity','Healing Bonus',
    'Cosmos DMG Bonus','Anima DMG Bonus','Incantation DMG Bonus',
    'Chaos DMG Bonus','Psyche DMG Bonus','Lakshana DMG Bonus','Mental DMG Bonus'
  )),
  is_dual_crit boolean GENERATED ALWAYS AS (
    has_crit_rate AND has_crit_dmg
  ) STORED
);

-- Console indexes
CREATE INDEX IF NOT EXISTS idx_console_pulls_created_at ON nte_console_pulls(created_at desc);
CREATE INDEX IF NOT EXISTS idx_console_pulls_logged_client_at ON nte_console_pulls(logged_client_at desc);
CREATE INDEX IF NOT EXISTS idx_console_pulls_session ON nte_console_pulls(session_id);
CREATE INDEX IF NOT EXISTS idx_console_pulls_server ON nte_console_pulls(server_region);

-- Console RLS
ALTER TABLE nte_console_pulls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous console inserts" ON nte_console_pulls
  FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "Allow anonymous console selects" ON nte_console_pulls
  FOR SELECT TO anon, authenticated USING (true);

-- Second-level stats view
CREATE OR REPLACE VIEW nte_second_stats AS
SELECT
  pull_second,
  count(*) as total_pulls,
  count(*) FILTER (WHERE is_dual_crit) as dual_crit_count,
  count(*) FILTER (WHERE has_crit_dmg) as cdmg_count,
  count(*) FILTER (WHERE has_crit_rate) as crate_count,
  count(*) FILTER (WHERE has_dmg_pct) as dmg_pct_count,
  count(*) FILTER (WHERE has_atk_pct) as atk_pct_count,
  count(*) FILTER (WHERE has_hp_pct) as hp_pct_count,
  count(*) FILTER (WHERE has_def_pct) as def_pct_count,
  count(*) FILTER (WHERE has_break_intensity) as break_count,
  count(*) FILTER (WHERE has_cycle_intensity) as cycle_count,
  round(count(*) FILTER (WHERE is_dual_crit) * 100.0 / nullif(count(*), 0), 2) as dual_crit_pct
FROM nte_pulls
GROUP BY pull_second;
