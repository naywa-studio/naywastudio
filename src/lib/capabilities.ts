/**
 * Capacités d'un membre au sein de son organisation — SOURCE UNIQUE DE VÉRITÉ
 * des droits.
 *
 * Pourquoi ce fichier existe : les droits étaient dispersés en `role === "owner"`
 * inline dans ~30 routes + les écrans. Résultat : accorder une capacité à un
 * membre (délégué) obligeait à repasser sur chaque fichier, et on en oubliait
 * (bug : le délégué avait le droit mais aucune route ne le reconnaissait).
 *
 * Règle désormais : TOUT passe par `getCapabilities(profile)`. L'UI l'utilise
 * pour afficher/masquer, les routes serveur pour autoriser/refuser. On ne
 * réintroduit JAMAIS de test de rôle épars ailleurs.
 *
 * `getCapabilities` est PUR (aucun accès DB) : on lui passe le profil déjà
 * chargé (par RLS côté client, par le service-role côté serveur). Il ne juge
 * PAS de l'abonnement (essai/paiement/lockdown) — ça reste `requireActiveAccess`
 * / `subscriptionAccess`. Ici on répond seulement à « qui a le droit de quoi ».
 */

import type { Profile } from "./database.types"

export interface Capabilities {
  /** Admin Naywa (transverse aux organisations) — bypass total. */
  isAdminNaywa: boolean
  /** Propriétaire de l'organisation. */
  isOwner: boolean
  /** Peut UTILISER le workspace en écriture (upload, matching, pipeline…).
   *  Nécessite un siège. NB : l'accès abonnement est vérifié séparément
   *  (`requireActiveAccess`) — cette cap dit seulement « occupe un siège ». */
  canSourcing: boolean
  /** Peut CONSULTER le workspace en lecture seule : tout membre invité dans
   *  l'org y a droit, même sans siège (il voit sans pouvoir muter). */
  canViewWorkspace: boolean
  /** Gère l'identité & le branding (logo, couleurs, slogan, email de contact,
   *  demandes de changement des champs verrouillés). */
  canBranding: boolean
  /** Gère la politique commerciale (marges, jours facturables, défauts TJM). */
  canPricing: boolean
  /** Gère l'équipe (inviter, attribuer un siège DÉJÀ payé, retirer un membre).
   *  Non exposé en V1 : owner uniquement en pratique. */
  canTeam: boolean
  /** Facturation, sièges payés (achat), transfert de propriété, suppression, et
   *  l'OCTROI de capacités aux membres. STRICTEMENT owner — jamais délégable.
   *  C'est la ligne rouge : aucune capacité déléguée ne l'ouvre. */
  isOrgAdmin: boolean
}

/**
 * Forme minimale de profil nécessaire au calcul. Accepte un `Profile` complet
 * ou n'importe quel sous-ensemble sélectionné dans une requête, du moment
 * qu'il porte ces colonnes.
 */
export type CapabilityProfile = Pick<
  Profile,
  | "role"
  | "is_admin"
  | "has_sourcing_seat"
  | "organization_id"
  | "can_manage_branding"
  | "can_manage_pricing"
  | "can_manage_team"
>

export function getCapabilities(
  profile: CapabilityProfile | null | undefined,
): Capabilities {
  const isAdminNaywa = profile?.is_admin === true
  const isOwner = profile?.role === "owner"
  // 1 user = 1 org : un profil chargé appartient toujours à une org. On garde
  // le test explicite pour couvrir le cas pathologique (trigger signup en
  // retard → organization_id NULL) où l'on ne veut RIEN accorder.
  const isOrgMember = !!profile?.organization_id

  return {
    isAdminNaywa,
    isOwner,
    canSourcing: isAdminNaywa || profile?.has_sourcing_seat === true,
    canViewWorkspace: isAdminNaywa || isOrgMember,
    canBranding: isAdminNaywa || isOwner || profile?.can_manage_branding === true,
    canPricing: isAdminNaywa || isOwner || profile?.can_manage_pricing === true,
    canTeam: isAdminNaywa || isOwner || profile?.can_manage_team === true,
    isOrgAdmin: isAdminNaywa || isOwner,
  }
}
