import type { Metadata } from "next"
import { LegalPageShell, type LegalSection } from "@/components/layout/LegalPageShell"

export const metadata: Metadata = {
  title: "Conditions générales d'utilisation | Naywa Studio",
  description: "Conditions générales d'utilisation du service Naywa Studio.",
}

const SECTIONS: LegalSection[] = [
  {
    title: "1. Objet",
    content: [
      "Les présentes Conditions Générales d'Utilisation (« CGU ») régissent l'accès et l'utilisation du service Naywa Studio (le « Service »), une plateforme SaaS d'assistance au sourcing pour les cabinets de recrutement, accessible à l'adresse naywastudio.com.",
      "Toute utilisation du Service implique l'acceptation pleine et entière des présentes CGU.",
    ],
  },
  {
    title: "2. Description du service",
    content: [
      "Naywa Studio met à disposition un workspace permettant à un cabinet de recrutement de :",
      "•importer des CVs et conserver un vivier centralisé ;",
      "•créer des missions et lancer un matching candidats × missions ;",
      "•suivre les candidats dans un pipeline (Identifié → Contacté → Réponse → Entretien → Pricing → Offre → Recruté) ;",
      "•calculer un chiffrage pricing à partir des paramètres Syntec ;",
      "•préparer et envoyer des messages d'approche, gérer les emails sortants et entrants.",
      "Naywa Studio s'appuie sur des modèles d'intelligence artificielle pour analyser les CVs, scorer la pertinence d'un candidat sur une mission, et générer des brouillons de messages.",
    ],
  },
  {
    title: "3. Rôle de Naywa Studio et rôle du Client",
    content: [
      "**Naywa Studio fournit une plateforme technique.** Le Service est un outil mis à disposition du Client (le cabinet de recrutement) qui l'utilise pour ses propres processus de sourcing.",
      "**Le Client reste seul responsable des données qu'il importe**, des décisions de recrutement qu'il prend, et de ses échanges avec les candidats. Naywa Studio ne se substitue jamais au Client dans le processus de décision.",
      "**Le Client est responsable du traitement** au sens du RGPD pour les données des candidats ; Naywa Studio agit comme sous-traitant. Voir la politique de confidentialité et le DPA disponible sur demande.",
    ],
  },
  {
    title: "4. L'intelligence artificielle ne décide jamais à votre place",
    content: [
      "Les fonctionnalités IA du Service (parsing CV, scoring candidat × mission, génération de message d'approche, suggestions de relance) produisent **des suggestions**. Elles n'ont aucun effet automatique sur le candidat.",
      "**Aucun email n'est envoyé à un candidat sans clic d'approbation explicite du Client.** Le brouillon généré par l'IA est toujours présenté au sourceur, qui peut le modifier, le valider ou le rejeter.",
      "**Aucun mouvement automatique dans le pipeline.** Les suggestions de l'IA d'avancer ou de rejeter un candidat sont affichées au sourceur, qui seul effectue le changement.",
      "Le Client garde le contrôle de toutes les communications sortantes. L'IA assiste, le sourceur décide.",
    ],
  },
  {
    title: "5. Création et gestion d'un compte",
    content: [
      "L'accès au Service nécessite la création d'un compte avec une adresse email valide.",
      "À la création, le Client (« Owner ») crée automatiquement une « organisation ». L'Owner peut ensuite inviter d'autres collaborateurs (« Members ») à rejoindre l'organisation. Tous les membres d'une même organisation partagent le vivier.",
      "Le Client est responsable de la confidentialité de son mot de passe. Toute action effectuée depuis son compte est réputée effectuée par lui.",
      "L'Owner peut à tout moment retirer un Member, ajouter un nouveau Member dans la limite des sièges disponibles, ou supprimer l'organisation entière.",
    ],
  },
  {
    title: "6. Abonnement, résiliation et rétention des données",
    content: [
      "Le service est commercialisé **par personne autorisée** (siège), selon un tarif dégressif au nombre de personnes. La **Suite Pricing Syntec** est une **option** facturée séparément, à prix unique quel que soit le nombre de personnes ; elle peut être activée ou retirée à tout moment et n'est pas requise pour utiliser le service. La grille tarifaire en vigueur est publiée sur la page Tarifs.",
      "**Résiliation de l'abonnement** : l'Owner peut résilier à tout moment depuis l'espace de gestion d'abonnement (portail sécurisé de notre prestataire de paiement). La résiliation prend effet à la fin de la période déjà payée : le Client conserve un accès complet jusqu'à cette date, aucun remboursement au prorata n'est dû.",
      "**Période de grâce (lecture seule)** : à l'issue de la période payée sans reconduction — ou à l'expiration de l'essai gratuit sans souscription — l'organisation bascule en **lecture seule pendant 30 jours**. Pendant cette période, le Client peut consulter et **exporter** ses données (RGPD), et **réactiver** son abonnement pour retrouver un accès complet. Aucune donnée n'est créée, modifiée ou générée en lecture seule.",
      "**Suppression des données après la grâce** : passé le délai de 30 jours sans réactivation, les données métier de l'organisation (vivier, missions, pipeline, messages) sont supprimées. Le compte et l'organisation sont conservés vides afin de permettre une éventuelle ré-souscription ultérieure.",
      "**Suppression volontaire de l'organisation** : l'Owner peut programmer la suppression de son organisation à tout moment depuis la console. L'organisation passe alors en lecture seule et est **supprimée définitivement à l'issue d'un délai de 30 jours**, avec l'ensemble de ses données et des comptes associés. Le Client peut **annuler cette suppression** à tout moment avant l'échéance.",
      "**Transfert de propriété** : l'Owner peut transférer la propriété de l'organisation à un autre membre depuis la console. L'ancien Owner devient alors membre.",
      "**Cession de siège** : un siège libéré pendant une période payée peut être ré-attribué par l'Owner sans surcoût.",
      "L'essai gratuit de 15 jours n'entraîne aucune facturation. La souscription payante ne démarre qu'après validation explicite d'une formule par le Client.",
    ],
  },
  {
    title: "7. Engagement de service",
    content: [
      "Naywa Studio met en œuvre les meilleurs efforts pour assurer la disponibilité du Service. Compte tenu de la nature d'Internet et des services tiers utilisés, **aucun engagement de disponibilité chiffré n'est donné**.",
      "Naywa Studio se réserve le droit d'interrompre temporairement le Service pour maintenance, avec préavis dans la mesure du possible.",
      "Aucune garantie de résultat n'est donnée concernant la qualité des suggestions de l'IA. Le score de matching, l'analyse de sentiment ou le brouillon de message restent des aides. Le Client conserve son entière responsabilité dans le choix final.",
    ],
  },
  {
    title: "8. Données du Client",
    content: [
      "Naywa Studio ne revendique aucun droit sur les données importées ou produites par le Client (CVs, missions, échanges).",
      "À la résiliation du compte, **toutes les données du Client sont supprimées** selon les modalités décrites dans la politique de confidentialité.",
      "À la demande écrite du Client, Naywa Studio fournit une copie exportable des données métier dans un format structuré (CSV/JSON), dans un délai de 30 jours.",
    ],
  },
  {
    title: "9. Obligations du Client",
    content: [
      "Le Client s'engage à :",
      "•n'importer que des CVs collectés conformément à la réglementation applicable ;",
      "•ne pas utiliser le Service à des fins illicites, discriminatoires ou contraires aux bonnes mœurs ;",
      "•ne pas tenter d'accéder aux données d'une autre organisation, ni d'interférer avec le fonctionnement technique du Service ;",
      "•respecter les obligations légales applicables au recrutement, notamment la non-discrimination, la protection des candidats mineurs, et la transparence sur l'usage de l'IA en sourcing.",
    ],
  },
  {
    title: "10. Propriété intellectuelle",
    content: [
      "Le code, les interfaces, les marques, le logo et tout autre élément du Service sont la propriété exclusive de Naywa Studio. Toute reproduction non autorisée est interdite.",
      "Les contenus importés par le Client (CVs, missions, messages) restent la propriété du Client. Naywa Studio dispose d'un droit d'usage limité à l'exécution du Service.",
    ],
  },
  {
    title: "11. Responsabilité",
    content: [
      "La responsabilité de Naywa Studio est limitée aux dommages directs prévisibles et ne pourra excéder le montant des sommes effectivement versées par le Client au titre des 12 derniers mois d'abonnement.",
      "Naywa Studio ne saurait être tenu responsable des décisions de recrutement prises par le Client, des conséquences des messages envoyés aux candidats, ou de l'interprétation des suggestions de l'IA.",
      "Naywa Studio ne pourra être tenu responsable des indisponibilités résultant de causes échappant à son contrôle raisonnable (force majeure, panne d'un prestataire tiers, attaque informatique externe, etc.).",
    ],
  },
  {
    title: "12. Modifications des CGU",
    content: [
      "Naywa Studio se réserve le droit de modifier les présentes CGU. Toute modification substantielle sera notifiée par email avec un délai de 15 jours avant prise d'effet.",
      "En cas de désaccord avec les nouvelles CGU, le Client peut résilier son abonnement dans le délai imparti.",
    ],
  },
  {
    title: "13. Droit applicable et juridiction",
    content: [
      "Les présentes CGU sont régies par le droit français.",
      "En cas de litige, les parties s'efforcent de trouver une solution amiable. À défaut, les tribunaux français seront seuls compétents.",
    ],
  },
]

export default function CGUPage() {
  return (
    <LegalPageShell
      badge="CGU"
      title="Conditions générales d'utilisation"
      lastUpdated="juin 2026"
      intro="Ces conditions encadrent l'utilisation du service Naywa Studio. Elles précisent notamment ce que Naywa Studio fait pour vous, ce que vous gardez sous votre responsabilité, et comment l'intelligence artificielle agit en assistance, jamais en remplacement de votre décision."
      sections={SECTIONS}
    />
  )
}
