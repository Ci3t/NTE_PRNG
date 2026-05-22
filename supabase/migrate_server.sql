-- ============================================================
-- MIGRATION: Add server_region to existing nte_pulls table
-- Run this in ONE shot in Supabase SQL Editor
-- ============================================================

-- Step 1: Add the column with a safe temporary default
-- (PostgreSQL requires default for NOT NULL on existing rows)
ALTER TABLE nte_pulls
  ADD COLUMN IF NOT EXISTS server_region text NOT NULL DEFAULT 'EU';

-- Step 2: Update all existing Ci3t records to EU
UPDATE nte_pulls
  SET server_region = 'EU'
  WHERE user_tag = 'Ci3t';

-- Step 3: Add the CHECK constraint to keep values clean
-- (Drop if it already exists from a failed attempt, then re-add)
ALTER TABLE nte_pulls
  DROP CONSTRAINT IF EXISTS nte_pulls_server_region_check;

ALTER TABLE nte_pulls
  ADD CONSTRAINT nte_pulls_server_region_check
  CHECK (server_region IN ('EU', 'NA', 'Asia'));

-- Step 4: Ensure the default going forward is EU
ALTER TABLE nte_pulls
  ALTER COLUMN server_region SET DEFAULT 'EU';

-- Step 5: Index for fast filtering
CREATE INDEX IF NOT EXISTS idx_nte_pulls_server ON nte_pulls(server_region);

-- Step 6: (Optional) Verify your data looks right
-- Uncomment the next line to check results:
-- SELECT server_region, COUNT(*) FROM nte_pulls GROUP BY server_region;
