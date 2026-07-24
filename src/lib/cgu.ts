/**
 * Acceptation des CGU (clickwrap) — source de vérité de la version courante.
 *
 * On enregistre l'acceptation par UTILISATEUR sur `profiles`
 * (cgu_accepted_at + cgu_version), écrite côté serveur → auditable et non
 * falsifiable. La case obligatoire à la création de compte est bloquante ;
 * les comptes antérieurs à cette fonctionnalité (ex. GMH) reçoivent une
 * bannière de rappel non bloquante tant qu'ils n'ont pas accepté.
 *
 * Bumper `CURRENT_CGU_VERSION` à chaque révision des CGU re-déclenche
 * l'acceptation (le rappel réapparaît pour tout le monde).
 */
export const CURRENT_CGU_VERSION = "2026-07-24"

export interface CguAcceptanceProfile {
  cgu_version: string | null
}

/** L'utilisateur a-t-il accepté la version courante des CGU ? */
export function hasAcceptedCgu(profile: CguAcceptanceProfile | null | undefined): boolean {
  return profile?.cgu_version === CURRENT_CGU_VERSION
}
