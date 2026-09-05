/**
 * Notifie le cabinet quand un candidat exerce un droit RGPD en self-service
 * (suppression, opposition) — APRÈS coup, jamais avant : la demande
 * s'exécute sans attendre de validation (cf. décision produit : un lien
 * signé envoyé à l'adresse du candidat EST la vérification d'identité,
 * ajouter une approbation humaine ne protégerait rien de plus et retarderait
 * l'exercice d'un droit sans délai excessif — article 17 RGPD).
 *
 * Best-effort : l'action RGPD elle-même est déjà exécutée et journalisée
 * avant l'appel à cette fonction — un échec d'envoi ne doit jamais la
 * remettre en cause.
 */

import { sendEmail, MAIL_DOMAIN } from "./resend"

export type PrivacyRequestNotifyAction = "delete" | "opt_out_contact"

const ACTION_LABEL: Record<PrivacyRequestNotifyAction, string> = {
  delete: "a demandé la suppression définitive de ses données",
  opt_out_contact: "s'est opposé à être recontacté",
}

export async function sendPrivacyRequestNotification(params: {
  contactEmail: string
  candidateRef: string
  action: PrivacyRequestNotifyAction
}): Promise<void> {
  const { contactEmail, candidateRef, action } = params

  const text = [
    `Un candidat (référence ${candidateRef}) ${ACTION_LABEL[action]}, via le lien reçu par email.`,
    "",
    action === "delete"
      ? "Ses données ont déjà été supprimées de votre vivier — cet email est une information, aucune action de votre part n'est requise."
      : "Il ne recevra plus de sollicitation de votre part — cet email est une information, aucune action de votre part n'est requise.",
    "",
    "Naywa Studio — notification automatique de conformité RGPD.",
  ].join("\n")

  await sendEmail({
    from: `Naywa Studio <rgpd@${MAIL_DOMAIN}>`,
    to: contactEmail,
    replyTo: `support.it@naywastudio.com`,
    subject: `Demande RGPD candidat traitée — ${candidateRef}`,
    text,
  })
}
