-- 046_branding_change_requests.sql
--
-- File des demandes de modification du branding "fort" (logo, nom,
-- email de contact) après la période de grâce post-onboarding.
--
-- Workflow :
--   1. Owner ouvre une demande depuis /organisation → POST sur
--      /api/cabinet/branding/request (un seul champ par demande,
--      pour pouvoir traiter indépendamment).
--   2. La ligne est créée avec status='pending'.
--   3. L'admin Naywa la voit dans /admin/demandes.
--   4. Approve → on applique la valeur sur organizations, on stamp
--      decided_at/decided_by, status='approved'. Mail Resend au
--      requester.
--   5. Reject → on stamp avec une raison textuelle, status='rejected'.
--      Mail Resend avec la raison.
--
-- Le champ "field" indique quelle propriété de l'org change. Une
-- demande = une propriété (pour pouvoir refuser le nom mais accepter
-- le logo dans le même set).
--
-- requested_value est stocké en TEXT pour porter à la fois :
--   - le nouveau nom (string lisible)
--   - le path Storage du nouveau logo (déjà uploadé en pending,
--     on supprime du Storage si refus)
--   - le nouveau contact_email (string)

CREATE TABLE IF NOT EXISTS public.branding_change_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  requested_by    UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  field           TEXT NOT NULL
    CHECK (field IN ('name', 'brand_logo_path', 'contact_email')),
  current_value   TEXT,           -- snapshot au moment de la demande
  requested_value TEXT NOT NULL,
  reason          TEXT,           -- justification owner (optionnel mais encouragé)
  status          TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  decided_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at      TIMESTAMPTZ,
  decision_note   TEXT,           -- raison du refus (envoyée par mail)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_branding_change_requests_org
  ON public.branding_change_requests (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_branding_change_requests_pending
  ON public.branding_change_requests (created_at DESC)
  WHERE status = 'pending';

-- RLS : un owner voit / annule ses propres demandes ; les admins
-- bypass via getAdminSupabase() pour les routes d'approbation.
ALTER TABLE public.branding_change_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members read own requests" ON public.branding_change_requests;
CREATE POLICY "Org members read own requests"
ON public.branding_change_requests
FOR SELECT
TO authenticated
USING (organization_id = public.current_org_id());

DROP POLICY IF EXISTS "Owner creates request" ON public.branding_change_requests;
CREATE POLICY "Owner creates request"
ON public.branding_change_requests
FOR INSERT
TO authenticated
WITH CHECK (
  organization_id = public.current_org_id()
  AND requested_by = auth.uid()
);

-- UPDATE limitée au requester pour passer status pending -> cancelled
-- (annulation de sa propre demande). Les transitions admin
-- (pending -> approved/rejected) passent par getAdminSupabase().
DROP POLICY IF EXISTS "Requester cancels own" ON public.branding_change_requests;
CREATE POLICY "Requester cancels own"
ON public.branding_change_requests
FOR UPDATE
TO authenticated
USING (
  requested_by = auth.uid()
  AND status = 'pending'
)
WITH CHECK (
  requested_by = auth.uid()
  AND status = 'cancelled'
);

COMMENT ON TABLE public.branding_change_requests IS
  'Demandes de modification du branding "fort" (logo, nom, contact_email) après la période de grâce post-onboarding. Validées manuellement par un admin Naywa via /admin/demandes.';
