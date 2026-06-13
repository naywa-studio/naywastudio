-- Migration 033 — Stripe subscription columns
--
-- Adds the columns needed to mirror a Stripe subscription on the
-- organization row. We don't store full subscription objects, just the
-- minimum to decide access and render the dashboard banner :
--
--   stripe_customer_id        — Stripe Customer, set on first Checkout
--   stripe_subscription_id    — Stripe Subscription, set after success
--   subscription_status       — mirrored from webhook on every change
--   subscription_price_lookup — `sourcing_3`, `sourcing_pro_3`… (lookup_key)
--   subscription_seats        — derived from the price lookup (1..N)
--   subscription_has_pricing  — true if the customer is on a "_pro_" plan
--   current_period_end        — when the current paid period ends
--
-- Why lookup_key instead of price ID : the IDs change between TEST and
-- LIVE Stripe modes, and we'll occasionally re-create prices. Lookup
-- keys are stable across modes — the resolver in lib/stripe.ts converts
-- them back to IDs at call time.

BEGIN;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS subscription_status text,
  ADD COLUMN IF NOT EXISTS subscription_price_lookup text,
  ADD COLUMN IF NOT EXISTS subscription_seats integer,
  ADD COLUMN IF NOT EXISTS subscription_has_pricing boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS current_period_end timestamptz;

-- Both Stripe IDs must be unique across the table — one Stripe customer
-- maps to exactly one org. Webhook handlers rely on this to upsert.
CREATE UNIQUE INDEX IF NOT EXISTS organizations_stripe_customer_id_key
  ON organizations(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS organizations_stripe_subscription_id_key
  ON organizations(stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

-- Constrain to Stripe's known states. NULL = the org has never had a
-- subscription (no Checkout success yet). The CHECK is loose on purpose
-- — if Stripe adds a state we'd rather not break the webhook handler.
ALTER TABLE organizations
  DROP CONSTRAINT IF EXISTS organizations_subscription_status_check;

ALTER TABLE organizations
  ADD CONSTRAINT organizations_subscription_status_check
  CHECK (
    subscription_status IS NULL OR subscription_status IN (
      'trialing',
      'active',
      'past_due',
      'canceled',
      'unpaid',
      'incomplete',
      'incomplete_expired',
      'paused'
    )
  );

COMMENT ON COLUMN organizations.stripe_customer_id IS
  'Stripe Customer ID. Created on first Checkout and reused for portal sessions / API updates.';
COMMENT ON COLUMN organizations.stripe_subscription_id IS
  'Active Stripe Subscription ID. NULL = no subscription ever or fully canceled.';
COMMENT ON COLUMN organizations.subscription_status IS
  'Mirror of stripe.subscription.status. Source of truth for workspace gating once Stripe is wired.';
COMMENT ON COLUMN organizations.subscription_price_lookup IS
  'Stripe lookup_key of the active price (sourcing_1..4, sourcing_pro_1..4). Persisted to avoid round-trips.';
COMMENT ON COLUMN organizations.subscription_seats IS
  'Number of seats the cabinet is paying for. Drives has_sourcing_seat allocation in /organisation.';
COMMENT ON COLUMN organizations.subscription_has_pricing IS
  'True if the active plan is the Pro variant (includes Suite Pricing Syntec).';
COMMENT ON COLUMN organizations.current_period_end IS
  'End of the currently paid Stripe billing period. Used to decide read-only mode after expiry.';

COMMIT;
