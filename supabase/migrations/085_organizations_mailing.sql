-- 085 — Mailing depuis le domaine du client : socle de données (lot 0).
--
-- Additive et entièrement nullable : tant qu'aucune organisation ne remplit
-- ces colonnes, rien ne change pour personne. Aucun flux existant n'est touché.
--
-- ⚠️ `mail.naywastudio.com` n'est PAS concerné. Il porte le SMTP de Supabase
-- (confirmations d'inscription, réinitialisations de mot de passe), le contact
-- et le support — autant d'emails que Naywa envoie EN SON NOM. Seul l'outreach
-- CANDIDAT bascule sur le domaine du client. Débrancher le relais reviendrait
-- à couper l'authentification de tous les utilisateurs.

-- ── Le domaine d'envoi de l'organisation ────────────────────────────────────
--
-- `mailing_domain` existait déjà en base (réservé, jamais exposé dans l'UI).
-- On l'accompagne du reste du modèle.

ALTER TABLE public.organizations
  -- Racine saisie par le client, ex. "cabinet-durand.fr".
  ADD COLUMN IF NOT EXISTS mailing_domain            text,
  -- Sous-domaine d'envoi, "careers" par défaut, modifiable.
  ADD COLUMN IF NOT EXISTS mailing_subdomain         text,
  -- Dérivé : "careers.cabinet-durand.fr". Stocké plutôt que recalculé, parce
  -- que c'est la clé de correspondance avec le fournisseur d'envoi.
  ADD COLUMN IF NOT EXISTS mailing_sending_domain    text,
  -- Chemin de mise en route effectivement emprunté :
  -- 'domain_connect' | 'ns_delegation' | 'naywa_managed'.
  ADD COLUMN IF NOT EXISTS mailing_path              text,
  -- Registrar détecté à la saisie. Sert au support et aux instructions
  -- affichées, jamais à une décision automatique.
  ADD COLUMN IF NOT EXISTS mailing_registrar         text,
  -- Machine à états :
  -- 'pending' → 'awaiting_dns' → 'verifying' → 'active', ou 'failed'.
  -- Tant que ce n'est pas 'active', l'envoi reste BLOQUÉ (règle « le domaine
  -- du client ou rien »).
  ADD COLUMN IF NOT EXISTS mailing_status            text,
  -- Vrai si Naywa a réservé le domaine pour le compte du client.
  ADD COLUMN IF NOT EXISTS mailing_managed           boolean NOT NULL DEFAULT false,
  -- Identifiant du domaine chez le fournisseur d'envoi.
  ADD COLUMN IF NOT EXISTS mailing_provider_domain_id text,
  -- Zone DNS que NOUS hébergeons (parcours délégation NS). NULL en Domain
  -- Connect, où les enregistrements vivent chez le registrar du client.
  ADD COLUMN IF NOT EXISTS mailing_dns_zone_id       text,
  -- Serveurs de noms à communiquer au client (parcours délégation NS).
  ADD COLUMN IF NOT EXISTS mailing_ns_records        jsonb,
  -- Enregistrements DKIM/SPF/DMARC/MX : sert à l'affichage ET à la vérification.
  ADD COLUMN IF NOT EXISTS mailing_dns_records       jsonb,
  ADD COLUMN IF NOT EXISTS mailing_verified_at       timestamptz,
  -- Délégation par email : le sourceur n'a pas toujours l'accès DNS. Jeton
  -- mono-usage envoyé au contact technique qu'il désigne.
  ADD COLUMN IF NOT EXISTS mailing_delegate_email    text,
  ADD COLUMN IF NOT EXISTS mailing_delegate_token    uuid,
  ADD COLUMN IF NOT EXISTS mailing_delegate_sent_at  timestamptz,
  -- Entitlement, miroir d'une ligne d'abonnement Stripe, exactement comme
  -- `subscription_has_pricing`. Écrit par le webhook, jamais par le client.
  ADD COLUMN IF NOT EXISTS subscription_has_mailing  boolean NOT NULL DEFAULT false;

-- Le jeton de délégation sert à retrouver l'organisation depuis un lien reçu
-- par email, sans authentification. L'index le rend immédiat, et l'unicité
-- interdit qu'un jeton en désigne deux.
CREATE UNIQUE INDEX IF NOT EXISTS organizations_mailing_delegate_token_idx
  ON public.organizations (mailing_delegate_token)
  WHERE mailing_delegate_token IS NOT NULL;

-- Le domaine d'envoi identifie l'organisation à la réception d'un email : deux
-- organisations ne peuvent pas revendiquer le même.
CREATE UNIQUE INDEX IF NOT EXISTS organizations_mailing_sending_domain_idx
  ON public.organizations (mailing_sending_domain)
  WHERE mailing_sending_domain IS NOT NULL;

COMMENT ON COLUMN public.organizations.mailing_status IS
  'pending | awaiting_dns | verifying | active | failed. L''envoi n''est autorisé qu''en ''active''.';
COMMENT ON COLUMN public.organizations.subscription_has_mailing IS
  'Option Mailing acquise. Miroir de la ligne add-on Stripe, écrit par le webhook (cf. subscription_has_pricing).';
