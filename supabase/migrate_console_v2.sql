-- Migration: Add main_stat column to nte_console_pulls for existing installs
-- Run this in the Supabase SQL Editor after the main setup.sql has already been applied.

ALTER TABLE nte_console_pulls
ADD COLUMN IF NOT EXISTS main_stat text;

ALTER TABLE nte_console_pulls
ADD CONSTRAINT IF NOT EXISTS nte_console_pulls_main_stat_check
  CHECK (main_stat IS NULL OR main_stat IN (
    'HP Bonus','ATK Bonus','DEF Bonus',
    'CRIT Rate','CRIT DMG',
    'Cycle Intensity','Break Intensity','Healing Bonus',
    'Cosmos DMG Bonus','Anima DMG Bonus','Incantation DMG Bonus',
    'Chaos DMG Bonus','Psyche DMG Bonus','Lakshana DMG Bonus','Mental DMG Bonus'
  ));
