/**
 * La mention d'information jointe aux messages candidats.
 *
 * ── L'obligation qu'elle remplit, et à qui elle appartient ───────────────
 *
 * Quand un cabinet écrit à quelqu'un dont il a obtenu le CV ailleurs — une
 * CVthèque, une cooptation —, le RGPD lui impose d'informer cette personne
 * **au plus tard lors de la première communication** (article 14). Cette
 * première communication, c'est ce message.
 *
 * L'obligation est celle du CABINET. Naywa n'est que sous-traitant : on aide,
 * on n'impose pas. D'où un texte modifiable et une mention retirable.
 *
 * ⚠️ Une idée fausse à ne pas laisser passer : « le CV vient d'une CVthèque,
 * donc c'est elle qui informe ». Non. La CVthèque est responsable de SON
 * traitement — héberger les CV et les rendre consultables. Dès que le cabinet
 * extrait un profil pour son propre recrutement, il devient responsable de ce
 * traitement-là et hérite de sa propre obligation.
 */

/** Champs de l'org dont dépend la mention. */
export interface NoticeOrg {
  name?: string | null
  brand_name?: string | null
  mailing_notice_enabled?: boolean | null
  mailing_notice_text?: string | null
}

/**
 * Le texte par défaut.
 *
 * Court volontairement. Une mention de dix lignes en bas d'un message
 * d'approche le fait ressembler à un publipostage — ce qu'il n'est pas, et ce
 * qui nuirait à la fois au taux de réponse et à la délivrabilité. Trois
 * informations suffisent : qui traite, pourquoi, et comment s'y opposer.
 */
export function defaultNotice(orgLabel: string): string {
  return (
    `— ${orgLabel} vous contacte dans le cadre d'un recrutement, à partir d'un CV ` +
    `en sa possession. Vous pouvez demander l'accès, la rectification ou la ` +
    `suppression de vos données, ou vous opposer à être recontacté, en répondant ` +
    `à ce message.`
  )
}

/** Le nom sous lequel le cabinet se présente au candidat. */
function orgLabel(org: NoticeOrg | null | undefined): string {
  return (org?.brand_name?.trim() || org?.name?.trim() || "Cette organisation")
}

/**
 * La mention à joindre, ou `null` si l'organisation l'a retirée.
 *
 * Un texte personnalisé vide compte comme un retrait : quelqu'un qui efface
 * tout exprime la même chose que quelqu'un qui décoche.
 */
export function noticeFor(org: NoticeOrg | null | undefined): string | null {
  if (org?.mailing_notice_enabled === false) return null
  const custom = org?.mailing_notice_text?.trim()
  if (custom) return custom
  if (org?.mailing_notice_text !== null && org?.mailing_notice_text !== undefined && !custom) return null
  return defaultNotice(orgLabel(org))
}

/**
 * Ajoute la mention au corps du message.
 *
 * Séparée par une ligne vide et rien d'autre : une barre de séparation ou un
 * changement de ton transformerait un message personnel en publipostage.
 *
 * Ne l'ajoute pas deux fois — un sourceur qui l'aurait recopiée dans son texte
 * ne doit pas la voir doublée.
 */
export function appendNotice(body: string, notice: string | null): string {
  if (!notice) return body
  if (body.includes(notice.slice(0, 40))) return body
  return `${body.trimEnd()}\n\n${notice}`
}
