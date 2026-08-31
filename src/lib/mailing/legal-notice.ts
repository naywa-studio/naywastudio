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

/**
 * La langue du message.
 *
 * ⚠️ Ce n'est PAS un détail cosmétique. La mention se lit **dans le message**,
 * juste sous la signature du sourceur. Une ligne en français au bas d'un
 * message écrit en anglais se voit immédiatement, et discrédite précisément le
 * passage censé rassurer le candidat sur le traitement de ses données.
 *
 * On prend la langue du SOURCEUR (`profiles.preferred_language`), faute de
 * mieux : celle du message lui-même n'est stockée nulle part. C'est une
 * approximation raisonnable — quelqu'un qui travaille en anglais écrit en
 * anglais — et elle vaut mieux que le français imposé à tout le monde.
 */
export type NoticeLang = "fr" | "en"

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
export function defaultNotice(orgLabel: string, lang: NoticeLang = "fr"): string {
  if (lang === "en") {
    return (
      `— ${orgLabel} is contacting you about a recruitment opportunity, based on a CV ` +
      `in its possession. You may request access to, rectification or deletion of your ` +
      `data, or object to being contacted again, by replying to this message.`
    )
  }
  return (
    `— ${orgLabel} vous contacte dans le cadre d'un recrutement, à partir d'un CV ` +
    `en sa possession. Vous pouvez demander l'accès, la rectification ou la ` +
    `suppression de vos données, ou vous opposer à être recontacté, en répondant ` +
    `à ce message.`
  )
}

/** Le nom sous lequel le cabinet se présente au candidat. */
function orgLabel(org: NoticeOrg | null | undefined, lang: NoticeLang): string {
  return (
    org?.brand_name?.trim() || org?.name?.trim() ||
    (lang === "en" ? "This organisation" : "Cette organisation")
  )
}

/**
 * La mention à joindre, ou `null` si l'organisation l'a retirée.
 *
 * Un texte personnalisé vide compte comme un retrait : quelqu'un qui efface
 * tout exprime la même chose que quelqu'un qui décoche.
 */
export function noticeFor(
  org: NoticeOrg | null | undefined,
  lang: NoticeLang = "fr",
): string | null {
  if (org?.mailing_notice_enabled === false) return null
  const custom = org?.mailing_notice_text?.trim()
  if (custom) return custom
  if (org?.mailing_notice_text !== null && org?.mailing_notice_text !== undefined && !custom) return null
  return defaultNotice(orgLabel(org, lang), lang)
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
