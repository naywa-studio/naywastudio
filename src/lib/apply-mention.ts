/**
 * Mention RGPD affichée sur le formulaire public de candidature (Slice 6.1)
 * et rappelée dans l'email de confirmation.
 *
 * Pas de texte éditable par cabinet en V1 (contrairement à
 * `mailing_notice_text` du chantier Mailing, qui n'existe pas sur cette
 * branche) — un texte par défaut, interpolé avec le nom du cabinet, la
 * mission et son adresse RGPD, calqué sur l'exemple du brief RGPD d'origine.
 * Rendre ce texte éditable est un possible lot futur, pas un manque de V1.
 */

export interface ApplyMentionParams {
  orgLabel: string
  jobTitle: string
  contactEmail: string
}

export function applyMentionText(params: ApplyMentionParams): string {
  const { orgLabel, jobTitle, contactEmail } = params
  return (
    `Les informations renseignées dans ce formulaire sont collectées par ${orgLabel}, ` +
    `responsable du traitement, afin de gérer votre candidature pour la mission « ${jobTitle} ».\n\n` +
    `Les données sont traitées via Naywa Studio, agissant en qualité de sous-traitant technique ` +
    `pour le compte de ${orgLabel}.\n\n` +
    `Les données collectées sont utilisées pour analyser votre candidature, évaluer son adéquation ` +
    `avec la mission et permettre au recruteur de vous contacter. Une aide à l'analyse par ` +
    `intelligence artificielle peut être utilisée pour mettre en avant les éléments pertinents de ` +
    `votre profil. La décision finale reste prise par un recruteur humain.\n\n` +
    `Vos données sont accessibles uniquement aux personnes habilitées participant au recrutement. ` +
    `Elles sont conservées pendant la durée du processus de recrutement, puis, si vous avez accepté ` +
    `d'être recontacté, jusqu'à 2 ans après le dernier contact.\n\n` +
    `Vous pouvez exercer vos droits d'accès, de rectification, d'effacement, d'opposition et de ` +
    `limitation en contactant : ${contactEmail}.`
  )
}

export const TALENT_POOL_CONSENT_LABEL =
  "J'accepte que mon profil soit conservé plus longtemps (jusqu'à 2 ans) afin d'être recontacté pour de futures opportunités."
