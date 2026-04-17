-- Migration 004: add contacted_at column to candidates
-- NULL = not contacted, timestamp = contacted by recruiter

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS contacted_at timestamptz DEFAULT NULL;
