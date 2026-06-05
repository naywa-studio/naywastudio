-- Migration 021 — Clean up legacy columns + add mailing_domain
--
-- Drops dead columns left over from past pivots:
--   - Old onboarding form  : sector, need, budget, agent_name, agent_price,
--                            subscription_level, booking_url, subscribed_at
--   - Phase 2 VPS agents   : vps_id, vps_ip, vps_status, agent_status
--   - Removed NoraAssistant: workspace_memory, workspace_messages
--   - Old quota system     : apify_credits_used, apify_reset_at
--
-- Adds organizations.mailing_domain — the cabinet's outbound email domain.
-- NULL = no custom domain. UI hides the field until Resend domain wiring
-- is built.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS mailing_domain text;

COMMENT ON COLUMN organizations.mailing_domain IS
  'Cabinet outbound mailing domain (e.g. "cabinet-dupont.com"). NULL = use the shared Naywa transactional domain. UI is masked until the Resend domain wiring ships.';

ALTER TABLE profiles
  DROP COLUMN IF EXISTS sector,
  DROP COLUMN IF EXISTS need,
  DROP COLUMN IF EXISTS budget,
  DROP COLUMN IF EXISTS agent_name,
  DROP COLUMN IF EXISTS agent_price,
  DROP COLUMN IF EXISTS subscription_level,
  DROP COLUMN IF EXISTS booking_url,
  DROP COLUMN IF EXISTS subscribed_at,
  DROP COLUMN IF EXISTS vps_id,
  DROP COLUMN IF EXISTS vps_ip,
  DROP COLUMN IF EXISTS vps_status,
  DROP COLUMN IF EXISTS agent_status,
  DROP COLUMN IF EXISTS workspace_memory,
  DROP COLUMN IF EXISTS workspace_messages,
  DROP COLUMN IF EXISTS apify_credits_used,
  DROP COLUMN IF EXISTS apify_reset_at;
