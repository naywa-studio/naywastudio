/**
 * « Puis-je écrire à ce candidat, et depuis quelle identité ? »
 *
 * ── Le défaut que ce fichier corrige ──────────────────────────────────────
 *
 * Tout se décidait au clic sur « Envoyer ». Un sourceur pouvait faire rédiger
 * un message par Nora, le relire, le retoucher — et découvrir seulement à
 * l'envoi que le candidat s'était désinscrit, ou que le plafond du cabinet
 * était atteint. Du travail perdu, et une confiance entamée pour une
 * information que le produit détenait AVANT la première frappe.
 *
 * ── Pourquoi une fonction pure, séparée de la route ───────────────────────
 *
 * La route rassemble les FAITS (base, quotas, boîtes) ; ce fichier décide de
 * l'ORDRE. Cette séparation vaut mieux qu'un enchaînement de `if` dans la
 * route pour une raison précise : l'ordre est la fonctionnalité. Ce qui bloque
 * doit passer avant ce qui avertit, et ce qui est imputable au candidat avant
 * ce qui est imputable au cabinet — sinon on annonce « connectez votre
 * messagerie » à propos de quelqu'un qui s'est désinscrit. Un ordre se teste ;
 * une suite de `if` répartie dans une route, non.
 *
 * ── Ce qui bloque VRAIMENT, et c'est peu ──────────────────────────────────
 *
 * Il y a toujours un transport disponible : la boîte connectée, sinon le
 * domaine du cabinet, sinon le domaine Naywa (cf. `api/cv/[id]/send`). Donc
 * « aucune boîte connectée » n'empêche pas d'écrire — ça change seulement
 * l'adresse qui s'affichera chez le candidat. Le dire comme un blocage serait
 * faux, et le produit paraîtrait cassé là où il fonctionne.
 *
 * Trois choses bloquent, et une seule vient de nous :
 *   1. le candidat n'a pas d'adresse ;
 *   2. son adresse est supprimée (rebond, plainte, désinscription) ;
 *   3. le plafond quotidien de l'ORGANISATION est atteint.
 *
 * Le reste avertit.
 *
 * ── Pourquoi des CODES et pas des phrases ─────────────────────────────────
 *
 * Le produit s'affiche en français et en anglais, et la traduction vit dans
 * les composants. Une route qui renverrait des phrases figerait la langue au
 * moment de l'appel — le sourceur qui bascule en anglais garderait un bandeau
 * français jusqu'au rechargement.
 */

import type { SuppressionReason } from "./suppression"

/** Par où le message partira réellement. Détermine l'adresse vue par le candidat. */
export type Transport =
  /** La boîte du sourceur (Gmail / Outlook). Sa vraie adresse. */
  | "mailbox"
  /** Le domaine du cabinet via SES : `recrutement@cabinet.fr`. */
  | "org_domain"
  /** Notre domaine. Fonctionne, mais l'identité n'est pas celle du cabinet. */
  | "naywa"

export type BlockCode = "no_email" | "suppressed" | "cap_reached"

export type WarningCode =
  /** Sa boîte a été révoquée : l'envoi bascule ailleurs, silencieusement. */
  | "mailbox_needs_reconnect"
  /** Ni boîte ni domaine : le candidat verra une adresse qui n'est pas celle du cabinet. */
  | "generic_identity"
  /** Le plafond du cabinet est proche. Prévenir vaut mieux que refuser. */
  | "cap_near"

export interface ReadinessFacts {
  /** `null` quand la fiche n'en porte pas. */
  email: string | null
  suppression: { blocked: boolean; reason: SuppressionReason | null }
  cap: { sent: number; limit: number }
  /** La boîte du sourceur, quel que soit son état — l'état est justement ce qui compte. */
  mailbox: { email: string; status: "active" | "needs_reconnect" } | null
  /** Le cabinet peut-il envoyer depuis son propre domaine (`canSendFromOrgDomain`) ? */
  orgDomainReady: boolean
  /** L'adresse d'expédition du chemin de repli, affichée telle quelle au sourceur. */
  fallbackAddress: string | null
}

export interface ReadinessVerdict {
  canWrite: boolean
  block: { code: BlockCode; reason?: SuppressionReason | null; sent?: number; limit?: number } | null
  warnings: { code: WarningCode; address?: string | null }[]
  transport: Transport
  /** L'adresse que verra le candidat. Le sourceur doit la connaître avant d'écrire. */
  fromAddress: string | null
}

/**
 * Seuil d'avertissement du plafond quotidien.
 *
 * 80 % laisse une marge de manœuvre réelle : sur un plafond de 60, il reste
 * douze envois — de quoi finir une série en cours et décider de la suite.
 * Prévenir plus tôt banaliserait le message ; plus tard ne servirait à rien.
 */
export const CAP_WARNING_RATIO = 0.8

/**
 * L'ordre est la fonctionnalité — cf. l'en-tête de ce fichier.
 *
 * On calcule le transport en premier parce que les avertissements en
 * dépendent, mais on renvoie les blocages avant tout le reste : un candidat
 * désinscrit rend l'identité d'expédition sans objet.
 */
export function evaluateReadiness(facts: ReadinessFacts): ReadinessVerdict {
  const transport: Transport = facts.mailbox?.status === "active"
    ? "mailbox"
    : facts.orgDomainReady
      ? "org_domain"
      : "naywa"

  const fromAddress = transport === "mailbox"
    ? (facts.mailbox?.email ?? null)
    : facts.fallbackAddress

  const blocked = (block: ReadinessVerdict["block"]): ReadinessVerdict =>
    ({ canWrite: false, block, warnings: [], transport, fromAddress })

  if (!facts.email) return blocked({ code: "no_email" })

  /* Avant le plafond, délibérément. Les deux interdisent d'écrire, mais l'un
   * est définitif et l'autre tombe à minuit : annoncer « revenez demain » à
   * propos de quelqu'un qui s'est désinscrit ferait réessayer pour rien. */
  if (facts.suppression.blocked) {
    return blocked({ code: "suppressed", reason: facts.suppression.reason })
  }

  if (facts.cap.limit > 0 && facts.cap.sent >= facts.cap.limit) {
    return blocked({ code: "cap_reached", sent: facts.cap.sent, limit: facts.cap.limit })
  }

  const warnings: ReadinessVerdict["warnings"] = []

  /* Une boîte révoquée est le défaut le plus sournois de l'add-on : l'envoi
   * continue de fonctionner, mais sous une autre identité que celle que le
   * sourceur croit utiliser. Ses candidats reçoivent soudain des messages
   * d'une adresse inconnue, et lui n'a rien vu passer. */
  if (facts.mailbox?.status === "needs_reconnect") {
    warnings.push({ code: "mailbox_needs_reconnect", address: facts.mailbox.email })
  }

  if (transport === "naywa") {
    warnings.push({ code: "generic_identity", address: fromAddress })
  }

  if (facts.cap.limit > 0 && facts.cap.sent >= facts.cap.limit * CAP_WARNING_RATIO) {
    warnings.push({ code: "cap_near" })
  }

  return { canWrite: true, block: null, warnings, transport, fromAddress }
}
