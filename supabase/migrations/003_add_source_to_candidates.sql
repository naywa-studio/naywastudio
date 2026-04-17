-- Migration 003: add source column to candidates
-- Tracks where each profile was found (LinkedIn, Malt, APEC)

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'linkedin';

-- Backfill existing rows
UPDATE candidates SET source = 'linkedin' WHERE source IS NULL;
