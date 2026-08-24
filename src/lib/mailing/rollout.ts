/**
 * L'interrupteur de mise à disposition du Mailing.
 *
 * ── Pourquoi il existe ────────────────────────────────────────────────────
 *
 * Le code est prêt et prouvé, mais DEUX conditions extérieures ne le sont
 * pas. Fusionner sans ce garde-fou exposerait aux clients une fonctionnalité
 * qui échoue :
 *
 *  1. **Le prix `mailing_addon` n'existe pas dans le catalogue LIVE.**
 *     L'interrupteur d'option s'afficherait chez GMH — le seul client
 *     payant — et un clic renverrait « Modification impossible ». Proposer
 *     puis refuser est pire que ne rien proposer.
 *
 *  2. **SES est encore en bac à sable.** Une organisation en essai voit
 *     l'option (l'essai donne tout), pourrait publier son DNS, faire vérifier
 *     son domaine… et constater que chaque envoi échoue, parce qu'AWS refuse
 *     d'écrire à une adresse non vérifiée. Elle aurait fait le travail DNS
 *     pour rien, ce qui est la meilleure façon de ne jamais le refaire.
 *
 * ── Comment l'ouvrir ──────────────────────────────────────────────────────
 *
 * Passer `MAILING_LAUNCHED` à `true`, une fois les deux conditions remplies.
 * Une ligne, un déploiement. Les admins Naywa, eux, voient tout dès
 * maintenant : c'est ainsi qu'on continue de l'éprouver en conditions réelles
 * sans rien montrer aux clients.
 */

/** ⚠️ À passer à `true` quand : accès production SES accordé ET prix LIVE créé. */
export const MAILING_LAUNCHED = false

/** Champs suffisants pour trancher — volontairement minces. */
export type MailingViewer = { is_admin?: boolean | null } | null | undefined

/** Idem côté organisation : on ne lit que ce qui sert à décider. */
export type MailingOrgFlag = { mailing_early_access?: boolean | null } | null | undefined

/**
 * Cette personne peut-elle voir et utiliser le Mailing ?
 *
 * Appelé côté SERVEUR (routes) autant que côté client (affichage) : masquer
 * dans l'interface sans fermer la route laisserait la fonctionnalité
 * atteignable par un appel direct, ce qui n'est pas ce qu'on veut d'un
 * garde-fou de lancement.
 *
 * ── Trois portes, et une seule ouverte à tous ────────────────────────────
 *
 *  - `MAILING_LAUNCHED` : l'ouverture générale, encore fermée ;
 *  - **admin Naywa** : pour éprouver en production ;
 *  - **avant-première** (`organizations.mailing_early_access`) : pour éprouver
 *    le parcours EXACTEMENT comme un client — sans bypass admin, avec les
 *    mêmes droits, les mêmes écrans, les mêmes refus.
 *
 * Cette troisième porte existe parce qu'un admin ne teste jamais vraiment ce
 * que vit un client : il contourne les gardes qu'on cherche justement à
 * vérifier.
 *
 * ⚠️ **Elle s'appuyait d'abord sur `is_test`**, au motif que ce drapeau « ne
 * désigne jamais un vrai client ». C'était faux : vérification faite en base,
 * **GMH** — le seul client payant — est marqué `is_test`, dans ses deux
 * organisations et sans aucun admin. Il aurait donc vu, en production, l'offre
 * de l'option Mailing dont le prix n'existe pas encore dans le catalogue LIVE :
 * proposer puis refuser au clic, exactement ce que ce fichier existe pour
 * empêcher.
 *
 * La leçon vaut au-delà du Mailing : `is_test` sert à EXCLURE des KPIs. Un
 * drapeau posé pour une raison ne doit pas en gouverner une autre — personne ne
 * pense à relire la seconde quand il change la première. D'où
 * `mailing_early_access` (migration 092), qui ne dit qu'une chose.
 */
export function mailingVisible(viewer: MailingViewer, org?: MailingOrgFlag): boolean {
  return MAILING_LAUNCHED || viewer?.is_admin === true || org?.mailing_early_access === true
}
