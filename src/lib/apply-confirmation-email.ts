/**
 * Email de confirmation envoyé au candidat après une candidature via le
 * formulaire public (Slice 6.1) : accusé de réception, rappel de la mention
 * RGPD, contact du recruteur, lien self-service (Slice 6.2 — la page n'est
 * pas encore construite au moment de cette slice, le lien mènera à une 404
 * tant que 6.2 n'est pas livrée, c'est attendu).
 */

import { sendEmail, MAIL_DOMAIN } from "./resend"
import { applyMentionText } from "./apply-mention"
import { candidatePrivacyToken } from "./candidate-privacy-token"
import { getAppUrl } from "./stripe"

export interface ApplyConfirmationParams {
  candidateEmail: string
  candidateFirstName: string | null
  candidateId: string
  jobTitle: string
  orgLabel: string
  contactEmail: string
}

export async function sendApplyConfirmationEmail(params: ApplyConfirmationParams): Promise<void> {
  const { candidateEmail, candidateFirstName, candidateId, jobTitle, orgLabel, contactEmail } = params

  const mention = applyMentionText({ orgLabel, jobTitle, contactEmail })
  const token = candidatePrivacyToken(candidateId)
  const privacyLink = token ? `${getAppUrl()}/privacy-request/${token}` : null

  const greeting = candidateFirstName ? `Bonjour ${candidateFirstName},` : "Bonjour,"

  const text = [
    greeting,
    "",
    `Votre candidature pour la mission « ${jobTitle} » auprès de ${orgLabel} a bien été reçue.`,
    "Un recruteur va l'étudier et reviendra vers vous s'il souhaite échanger.",
    "",
    "— Mention d'information —",
    mention,
    "",
    privacyLink
      ? `Pour consulter, corriger ou supprimer vos données à tout moment : ${privacyLink}`
      : null,
    "",
    "Cet email est envoyé automatiquement par Naywa Studio pour le compte de " + orgLabel + ".",
  ].filter((line) => line !== null).join("\n")

  // orgLabel vient de brand_name/name, saisi librement par le cabinet — un
  // "<", ">" ou guillemet dedans casserait la syntaxe du header From et
  // ferait rejeter l'envoi par Resend (silencieusement, côté candidat).
  // Même nettoyage que fromHeader() dans resend.ts.
  const safeOrgLabel = orgLabel.replace(/["<>]/g, "")

  await sendEmail({
    from: `${safeOrgLabel} via Naywa <candidatures@${MAIL_DOMAIN}>`,
    to: candidateEmail,
    replyTo: contactEmail,
    subject: `Candidature reçue — ${jobTitle}`,
    text,
  })
}
