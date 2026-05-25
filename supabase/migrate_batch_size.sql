-- Migration: Add batch_size column to both tables for x1 vs x10 tracking
-- Run this in the Supabase SQL Editor for existing installs.

ALTER TABLE nte_pulls
ADD COLUMN IF NOT EXISTS batch_size int NOT NULL DEFAULT 1;

ALTER TABLE nte_console_pulls
ADD COLUMN IF NOT EXISTS batch_size int NOT NULL DEFAULT 1;
