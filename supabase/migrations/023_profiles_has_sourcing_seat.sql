-- Migration 023 — Decouple admin role from sourcing seat
--
-- Until now an "owner" implicitly used a sourcing seat. We now split the
-- two: owners manage the cabinet (always), but only profiles that
-- explicitly hold a seat can access /workspace. Invitees automatically
-- get a seat when they accept (since that's the whole point of the
-- invite); owners must allocate one to themselves from /cabinet.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS has_sourcing_seat boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN profiles.has_sourcing_seat IS
  'True if this profile uses one of the org sourcing seats. Owners default to false (admin-only); invitees default to true. /workspace access is gated on this column.';
