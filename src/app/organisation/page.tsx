"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useRouter, useSearchParams } from "next/navigation"
import { m } from "framer-motion"
import { useCabinet } from "./layout"
import { getSupabase } from "@/lib/supabase"
import { trialStatus, TRIAL_DURATION_DAYS, TRIAL_SEAT_CAP } from "@/lib/trial"
import {
  subscriptionAccess,
  hasActiveAccess,
  hasPricingAccess,
  scheduledCancellation,
  GRACE_DAYS,
} from "@/lib/subscription"
import {
  priceForSeats,
  monthlyTotalEur,
  cvIncludedForSeats,
  isSelfServeSeats,
  PRICING_ADDON_EUR,
  MAX_SELF_SERVE_SEATS,
  formatEur,
} from "@/lib/pricing-plan"
import type { Organization } from "@/lib/database.types"
import { PricingOnboardingWizard } from "@/components/organisation/PricingOnboardingWizard"
import { BrandColorPicker } from "@/components/organisation/BrandColorPicker"
import { UpdatesHeroCard } from "@/components/updates/UpdatesHeroCard"
import { useEscapeKey } from "@/components/ui/useEscapeKey"
import { QuotaGauges } from "@/components/quota/QuotaGauges"
import { useLanguage, type Lang } from "@/lib/i18n/LanguageContext"

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

const copy = {
  fr: {
    // OrgTabs
    orgFallback: "Organisation",
    tabPackages: "Mes packages",
    tabSecurity: "Sécurité",
    // EmailConfirmationBanner
    confirmEmailTitle: "Confirmez votre adresse",
    confirmEmailBody: (email: string) => <>un email a été envoyé à <strong>{email}</strong>. Vérifiez votre boîte de réception (et le dossier spam) pour valider votre compte.</>,
    emailResent: (s: number) => `Email renvoyé. Réessayez dans ${s}s.`,
    sending: "Envoi…",
    resendLink: "Renvoyer le lien",
    resendFailed: "Impossible de renvoyer",
    // MySeatBanner
    allocationError: "Erreur lors de l'allocation.",
    releaseConfirm: "Libérer votre siège ? Vous perdrez l'accès au workspace jusqu'à ce que vous vous en allouiez un nouveau.",
    genericError: "Erreur.",
    seatOccupiedTitle: "Vous occupez un siège du Package Sourcing.",
    seatOccupiedBody: "Accès complet au workspace (vivier, missions, pricing, pipeline).",
    openWorkspaceArrow: "Ouvrir le workspace →",
    releaseSeat: "Libérer le siège",
    noSeatTitle: "Vous n'avez pas encore alloué de siège du Package Sourcing.",
    noSeatBody: "Allouez-vous un siège pour accéder au workspace, ou invitez un collègue pour qu'il utilise un siège à votre place.",
    allocating: "Allocation…",
    allocateSelf: "M'allouer un siège",
    // SubscriptionCard
    subscription: "Abonnement",
    subStatusSubtitle: "Statut du Package Sourcing.",
    deletionScheduled: "Suppression programmée",
    orgWillBeDeletedReadOnly: (date: string) => <>L&apos;organisation et toutes ses données seront supprimées le <strong>{date}</strong>. Le workspace est en lecture seule d&apos;ici là. Vous pouvez encore tout annuler.</>,
    cancelDeletionFailed: "Annulation impossible",
    cancelling: "Annulation…",
    cancelDeletion: "Annuler la suppression",
    ownerOnlyCancelDeletion: "Seul le propriétaire de l'organisation peut annuler.",
    portalUnavailable: "Portail indisponible",
    subSubtitle: "Package Sourcing : votre essai et votre formule.",
    paymentFailed: "Échec du dernier paiement. Mettez à jour votre moyen de paiement.",
    cancellationScheduled: "Résiliation programmée",
    scheduledCancelBody: (plan: string, endsAt: string, graceDays: number) => (
      <>{plan} — votre accès reste complet jusqu&apos;au <strong>{endsAt}</strong>. Aucun nouveau prélèvement. Ensuite vous disposerez de {graceDays} jours en lecture seule pour exporter vos données ou réactiver.</>
    ),
    trialUntil: (date: string) => <>Période d&apos;essai jusqu&apos;au <strong>{date}</strong>.</>,
    nextCharge: (date: string) => <>Prochain prélèvement le <strong>{date}</strong>.</>,
    openingPortal: "Ouverture du portail…",
    manageSubscription: "Gérer mon abonnement",
    resumeSubscription: "Reprendre mon abonnement →",
    noActiveSubscription: "Aucun abonnement actif",
    startTrialBody: (days: number, seats: number) => `Démarrez votre essai gratuit ${days} jours (jusqu'à ${seats} sièges, sans carte bancaire) ou souscrivez directement pour aller plus loin.`,
    activating: "Activation…",
    startFreeTrial: (days: number) => `Démarrer mes ${days} jours gratuits →`,
    subscribeToPlan: "Souscrire à un abonnement",
    trialActive: (days: number) => `Essai actif · ${days} jour${days > 1 ? "s" : ""} restant${days > 1 ? "s" : ""}`,
    trialEndsOn: (date: string, seats: number) => <>Termine le <strong>{date}</strong>. Plafonné à {seats} sièges — souscrivez pour ajouter plus de membres ou continuer après l&apos;essai.</>,
    subscribeToPlanArrow: "Souscrire à un abonnement →",
    adminAccountTitle: "Compte administrateur Naywa",
    adminAccountBody: "Accès permanent — aucun abonnement requis pour ce compte.",
    trialEndedTitle: "Période d'essai terminée",
    trialEndedBody: "Souscrivez pour reprendre l'accès à votre workspace.",
    subscribeArrow: "Souscrire au Package Sourcing →",
    seatsAllocated: (n: number) => `${n} siège${n > 1 ? "s" : ""} alloué${n > 1 ? "s" : ""}.`,
    activationFailed: "Activation impossible",
    // planLabel
    planPro: "Package Sourcing Pro",
    planStandard: "Package Sourcing",
    // PlanPickerModal
    checkoutUnavailable: "Checkout indisponible",
    subscribeToTitle: "Souscrire au Package Sourcing",
    chooseYourPlan: "Choisissez votre formule",
    tierStandardDesc: "Vivier, matching, anonymisation.",
    tierProDesc: "+ Suite Pricing Syntec (engine + chart + PDF).",
    seatsCount: "Nombre de sièges",
    recommended: "Reco",
    seatSuffix: (n: number) => `siège${n > 1 ? "s" : ""}`,
    personLabel: (n: number) => `personne${n > 1 ? "s" : ""}`,
    monthlyTotalExclTax: "Total mensuel HT",
    cvUnit: (n: string) => `${n} CV`,
    unlimitedMatchings: "Matchings illimités",
    noVatNote: "Pas de TVA appliquée (micro-entreprise). Annulation à tout moment depuis votre portail Stripe.",
    beyond4Seats: " Au-delà de 4 sièges, contactez-nous pour un devis.",
    cancel: "Annuler",
    redirecting: "Redirection…",
    continueToPayment: "Continuer vers le paiement →",
    howManyPeople: "Combien de personnes utiliseront Naywa ?",
    removePerson: "Retirer une personne",
    numberOfPeople: "Nombre de personnes",
    addPerson: "Ajouter une personne",
    thatIs: (v: string) => `soit ${v}`,
    perPersonSuffix: (v: string) => ` · ${v} par personne`,
    seatDiscountHint: "Tarif dégressif : plus vous êtes nombreux, moins la personne coûte.",
    pricingAddonExtra: "TJM, marges, simulation et fiche PDF. Prix unique, quel que soit le nombre de personnes.",
    cvIncluded: (n: string) => `${n} CV inclus`,
    talkAboutItTitle: (n: number) => `À ${n} personnes, parlons-en`,
    talkAboutItBody: (max: number) => `Au-delà de ${max} personnes, on construit une offre avec vous plutôt que de vous laisser deviner. Prenez 20 minutes avec l'équipe.`,
    continueWithPrice: (v: string) => `Continuer — ${v}/mois →`,
    bookAppointment: "Prendre rendez-vous →",
    // PricingAddonToggle
    addonToggleFailed: "Modification impossible",
    addonSyncing: "Synchronisation…",
    addonIncluded: (v: string) => `Incluse · ${v}/mois`,
    addonOptional: (v: string) => `Option · ${v}/mois, résiliable à tout moment`,
    removeAddon: "Retirer",
    activateAddon: "Activer",
    ownerOnlySubscription: "Seul le propriétaire peut modifier l'abonnement.",
    // IdentitySection
    orgIdentityTitle: "Identité de l'organisation",
    orgIdentitySubtitle: "Vitrine telle qu'elle apparaîtra sur les CV anonymisés. Modifiable dans Branding.",
    noSlogan: "Pas de slogan",
    defaultColorTitle: "Couleur par défaut (noir)",
    noContactEmail: "Aucun email de contact",
    // BrandingSection
    saveError: "Erreur lors de la sauvegarde.",
    summaryLogo: "Logo", summaryColor: "Couleur", summaryBicolor: "Bicolore",
    summarySlogan: "Slogan", summaryContact: "Contact", summaryToConfigure: "À configurer",
    branding: "Branding",
    brandingSubtitle: "Logo, couleurs, slogan et contact qui apparaissent sur les CV anonymisés.",
    requestChangeTitle: "Demander une modification du nom, du logo ou de l'email de contact",
    editLockedInfo: "Modifier vos informations verrouillées",
    collapse: "Replier ▴", expand: "Déplier ▾",
    orgNameLabel: "Nom de l'organisation",
    orgNamePlaceholder: "Cabinet Dupont",
    saving: "Sauvegarde…",
    autoSave: "Sauvegarde automatique",
    logoLabel: "Logo",
    none: "Aucun",
    replaceLogo: "Remplacer",
    uploadLogo: "Téléverser",
    removeLogo: "Retirer",
    brandColorsLabel: "Couleurs de marque",
    brandColorsHint: "Non configurée = rendu en noir sur le PDF anonymisé. Choisissez une couleur de votre logo ou de la palette suggérée.",
    sloganLabel: "Slogan", optionalTag: "(optionnel)",
    sloganPlaceholder: "Recruter, c'est notre métier",
    charsCount: (n: number) => `${n}/120 caractères`,
    contactEmailLabel: "Email de contact",
    contactEmailPlaceholder: "contact@votre-cabinet.com",
    invalidEmailFormat: "Format d'email invalide",
    contactEmailHint: "Ajouté en pied de page du CV anonymisé. Permet au client final de vous recontacter.",
    // RequestStatusInline
    requestPending: "Demande en cours de traitement.",
    requestPendingBody: (date: string) => `Soumise le ${date}. Vous recevrez un email dès qu'elle est validée ou refusée.`,
    requestApproved: "Modification validée",
    onThe: (date: string) => ` le ${date}`,
    requestRejected: "Demande refusée",
    // LockedBadge
    locked: "Verrouillé",
    // BrandingChangeRequestModal
    changeRequestEyebrow: "Demande de modification",
    changeRequestTitle: "Modifier vos informations verrouillées",
    changeRequestBody: "Cochez les informations que vous souhaitez modifier, puis indiquez la nouvelle valeur pour chacune. Notre équipe examinera votre demande sous 24 à 48 heures ouvrées et vous répondra par email.",
    whyThisStep: "Pourquoi cette étape ?",
    whyThisStepBody: "Le nom, le logo et l'email de contact apparaissent sur les CV anonymisés que vous présentez à vos clients. Pour éviter l'usurpation d'identité d'un cabinet, ces informations sont verrouillées 24 heures après la fin de votre onboarding et leur modification passe par une validation manuelle.",
    undefined_: "(non défini)",
    logoField: "Logo",
    currentLogo: "Logo actuel",
    noLogo: "Aucun logo",
    current: "Actuel",
    new_: "Nouveau",
    toChoose: "À choisir",
    uploading: "Upload…",
    replaceFile: "Remplacer le fichier",
    chooseFile: "Choisir un fichier",
    reasonLabel: "Raison de la demande",
    reasonPlaceholder: "Ex : nouveau positionnement de la marque, fusion, faute de frappe lors de l'inscription…",
    checkAtLeastOne: "Cochez au moins une information à modifier.",
    sendingRequest: "Envoi…",
    sendRequest: "Envoyer la demande",
    errorWithStatus: (status: number) => `Erreur ${status}`,
    // ChangeBlock
    currentPrefix: (v: string) => `Actuel : ${v}`,
    // PricingPolicySectionCollapsible
    pricingPolicyTitle: "Politique pricing",
    pricingPolicySubtitle: "Marges cibles + avantages standards de l'organisation.",
    pricingPolicyReused: "Réutilisé sur chaque chiffrage candidat × mission.",
    marginsBenefitsLocations: "Marges, avantages, lieux",
    configureDetails: "Configurez les paramètres détaillés.",
    configureArrow: "Configurer →",
    // MembersSection
    invalidEmail: "Adresse email invalide.",
    inviteSendError: "Erreur lors de l'envoi.",
    inviteSentTo: (email: string) => `Invitation envoyée à ${email}.`,
    revokeError: "Erreur lors de la révocation.",
    removeConfirm: (label: string) => `Retirer ${label} de l'organisation ?`,
    allocateError: "Allocation impossible.",
    deallocateConfirm: (label: string) => `Libérer le siège de ${label} ? L'utilisateur reste dans l'organisation mais perd l'accès au workspace.`,
    deallocateError: "Libération impossible.",
    seatReleased: (label: string) => `Siège de ${label} libéré.`,
    // Délégation de la configuration (branding + politique pricing).
    delegateOnLabel: "Config.",
    delegateOffLabel: "Déléguer",
    delegateAddHint: "Autoriser ce membre à gérer le branding et la politique de pricing",
    delegateRemoveHint: "Retirer la gestion de la configuration à ce membre",
    delegateConfirm: (label: string) =>
      `Autoriser ${label} à modifier le branding et la politique de pricing de l'organisation ?\n\nCela ne donne accès ni à la facturation, ni aux sièges, ni à la suppression.`,
    delegateOn: (label: string) => `${label} peut désormais gérer la configuration.`,
    delegateOff: (label: string) => `${label} ne gère plus la configuration.`,
    delegateError: "Impossible de modifier la délégation.",
    members: "Membres",
    seatsSubtitle: (used: number, total: number) => `${used} sur ${total} sièges · vivier partagé`,
    noFirstName: "Sans prénom",
    youSuffix: " · vous",
    releaseThisSeat: "Libérer ce siège",
    releaseAction: "Libérer",
    invitePending: "Invitation envoyée par email · en attente",
    cancelAction: "Annuler",
    inviteEmailPlaceholder: "email@organisation.com",
    send: "Envoyer",
    emptySeat: "Siège vide",
    footerNote: "Les invitations sont envoyées par email. Le membre clique sur le lien reçu, choisit son mot de passe, et accède directement au workspace.",
    // EmptySeatActions
    addMember: "+ Ajouter un membre",
    allocateSeatDropdown: "+ Allouer un siège ▾",
    inviteNewMember: "+ Inviter un nouveau membre (email)",
    allocateToSelf: "M'allouer un siège",
    allocateTo: (name: string) => `Allouer à ${name}`,
    ownerTag: "(owner)",
    // DangerSection
    deleteError: "Erreur lors de la suppression.",
    cancelDeletionError: "Annulation impossible.",
    dangerZone: "Zone de danger",
    deleteOrgBodyFull: <>Programmer la suppression de l&apos;organisation et de toutes ses données. Le workspace passe en lecture seule pendant <strong>30 jours</strong> (le temps d&apos;exporter vos données), puis tout est supprimé définitivement. Vous pouvez annuler à tout moment avant l&apos;échéance.</>,
    deleteMyOrg: "Supprimer mon organisation",
    deleteOrgConfirmTitle: (name: string) => `Supprimer ${name} ?`,
    deleteOrgConfirmBody: <>L&apos;organisation passe en <strong>lecture seule</strong> et sera supprimée définitivement, avec toutes ses données, dans <strong>30 jours</strong>. Vous (et vos collègues) pourrez exporter les données et <strong>annuler</strong> la suppression à tout moment avant l&apos;échéance.</>,
    typeOrgNameToConfirm: <>Tapez le nom de l&apos;organisation pour confirmer&nbsp;:</>,
    scheduleDeletion: "Programmer la suppression",
    scheduling: "Programmation…",
    // ExportDataCard
    exportMyData: "Exporter mes données",
    exportBody: "Téléchargez un fichier JSON avec l'intégralité de votre organisation : candidats, missions, matches, mails et paramétrage. Conservez-le comme archive.",
    exportDisclaimer: "En raison des mises à jour produit, nous ne pouvons pas garantir la restauration complète de ces données dans une future version du service.",
    preparing: "Préparation…",
    downloadJson: "Télécharger l'export JSON",
  },
  en: {
    orgFallback: "Organization",
    tabPackages: "My packages",
    tabSecurity: "Security",
    confirmEmailTitle: "Confirm your address",
    confirmEmailBody: (email: string) => <>an email was sent to <strong>{email}</strong>. Check your inbox (and spam folder) to validate your account.</>,
    emailResent: (s: number) => `Email resent. Try again in ${s}s.`,
    sending: "Sending…",
    resendLink: "Resend the link",
    resendFailed: "Unable to resend",
    allocationError: "Error while allocating.",
    releaseConfirm: "Release your seat? You'll lose access to the workspace until you allocate a new one.",
    genericError: "Error.",
    seatOccupiedTitle: "You occupy a Sourcing Package seat.",
    seatOccupiedBody: "Full workspace access (talent pool, missions, pricing, pipeline).",
    openWorkspaceArrow: "Open workspace →",
    releaseSeat: "Release seat",
    noSeatTitle: "You haven't allocated a Sourcing Package seat yet.",
    noSeatBody: "Allocate yourself a seat to access the workspace, or invite a colleague to use a seat instead.",
    allocating: "Allocating…",
    allocateSelf: "Allocate myself a seat",
    subscription: "Subscription",
    subStatusSubtitle: "Sourcing Package status.",
    deletionScheduled: "Deletion scheduled",
    orgWillBeDeletedReadOnly: (date: string) => <>The organization and all its data will be deleted on <strong>{date}</strong>. The workspace is read-only until then. You can still cancel.</>,
    cancelDeletionFailed: "Cancellation failed",
    cancelling: "Cancelling…",
    cancelDeletion: "Cancel the deletion",
    ownerOnlyCancelDeletion: "Only the organization owner can cancel.",
    portalUnavailable: "Portal unavailable",
    subSubtitle: "Sourcing Package: your trial and your plan.",
    paymentFailed: "Last payment failed. Update your payment method.",
    cancellationScheduled: "Cancellation scheduled",
    scheduledCancelBody: (plan: string, endsAt: string, graceDays: number) => (
      <>{plan} — your access remains full until <strong>{endsAt}</strong>. No new charge. After that, you&apos;ll have {graceDays} days in read-only mode to export your data or reactivate.</>
    ),
    trialUntil: (date: string) => <>Trial until <strong>{date}</strong>.</>,
    nextCharge: (date: string) => <>Next charge on <strong>{date}</strong>.</>,
    openingPortal: "Opening portal…",
    manageSubscription: "Manage my subscription",
    resumeSubscription: "Resume my subscription →",
    noActiveSubscription: "No active subscription",
    startTrialBody: (days: number, seats: number) => `Start your ${days}-day free trial (up to ${seats} seats, no credit card) or subscribe directly to go further.`,
    activating: "Activating…",
    startFreeTrial: (days: number) => `Start my ${days} free days →`,
    subscribeToPlan: "Subscribe to a plan",
    trialActive: (days: number) => `Trial active · ${days} day${days > 1 ? "s" : ""} left`,
    trialEndsOn: (date: string, seats: number) => <>Ends on <strong>{date}</strong>. Capped at {seats} seats — subscribe to add more members or continue after the trial.</>,
    subscribeToPlanArrow: "Subscribe to a plan →",
    adminAccountTitle: "Naywa admin account",
    adminAccountBody: "Permanent access — no subscription required for this account.",
    trialEndedTitle: "Trial period ended",
    trialEndedBody: "Subscribe to regain access to your workspace.",
    subscribeArrow: "Subscribe to the Sourcing Package →",
    seatsAllocated: (n: number) => `${n} seat${n > 1 ? "s" : ""} allocated.`,
    activationFailed: "Activation failed",
    planPro: "Sourcing Package Pro",
    planStandard: "Sourcing Package",
    checkoutUnavailable: "Checkout unavailable",
    subscribeToTitle: "Subscribe to the Sourcing Package",
    chooseYourPlan: "Choose your plan",
    tierStandardDesc: "Talent pool, matching, anonymization.",
    tierProDesc: "+ Syntec Pricing Suite (engine + chart + PDF).",
    seatsCount: "Number of seats",
    recommended: "Reco",
    seatSuffix: (n: number) => `seat${n > 1 ? "s" : ""}`,
    personLabel: (n: number) => `person${n > 1 ? "s" : ""}`,
    monthlyTotalExclTax: "Monthly total excl. VAT",
    cvUnit: (n: string) => `${n} CVs`,
    unlimitedMatchings: "Unlimited matchings",
    noVatNote: "No VAT applied (micro-entreprise). Cancel anytime from your Stripe portal.",
    beyond4Seats: " Beyond 4 seats, contact us for a quote.",
    cancel: "Cancel",
    redirecting: "Redirecting…",
    continueToPayment: "Continue to payment →",
    howManyPeople: "How many people will use Naywa?",
    removePerson: "Remove a person",
    numberOfPeople: "Number of people",
    addPerson: "Add a person",
    thatIs: (v: string) => `i.e. ${v}`,
    perPersonSuffix: (v: string) => ` · ${v} per person`,
    seatDiscountHint: "Volume discount: the more people you have, the less each one costs.",
    pricingAddonExtra: "Daily rate, margins, simulation and PDF sheet. Flat price, regardless of headcount.",
    cvIncluded: (n: string) => `${n} CVs included`,
    talkAboutItTitle: (n: number) => `At ${n} people, let's talk`,
    talkAboutItBody: (max: number) => `Beyond ${max} people, we build an offer with you instead of leaving you guessing. Take 20 minutes with the team.`,
    continueWithPrice: (v: string) => `Continue — ${v}/mo →`,
    bookAppointment: "Book an appointment →",
    // PricingAddonToggle
    addonToggleFailed: "Change failed",
    addonSyncing: "Syncing…",
    addonIncluded: (v: string) => `Included · ${v}/mo`,
    addonOptional: (v: string) => `Option · ${v}/mo, cancel anytime`,
    removeAddon: "Remove",
    activateAddon: "Activate",
    ownerOnlySubscription: "Only the owner can change the subscription.",
    orgIdentityTitle: "Organization identity",
    orgIdentitySubtitle: "Showcase as it will appear on anonymized CVs. Editable in Branding.",
    noSlogan: "No slogan",
    defaultColorTitle: "Default color (black)",
    noContactEmail: "No contact email",
    saveError: "Error while saving.",
    summaryLogo: "Logo", summaryColor: "Color", summaryBicolor: "Two-tone",
    summarySlogan: "Slogan", summaryContact: "Contact", summaryToConfigure: "To configure",
    branding: "Branding",
    brandingSubtitle: "Logo, colors, slogan and contact info that appear on anonymized CVs.",
    requestChangeTitle: "Request a change to the name, logo, or contact email",
    editLockedInfo: "Edit your locked information",
    collapse: "Collapse ▴", expand: "Expand ▾",
    orgNameLabel: "Organization name",
    orgNamePlaceholder: "Smith Recruiting",
    saving: "Saving…",
    autoSave: "Auto-saved",
    logoLabel: "Logo",
    none: "None",
    replaceLogo: "Replace",
    uploadLogo: "Upload",
    removeLogo: "Remove",
    brandColorsLabel: "Brand colors",
    brandColorsHint: "Not configured = rendered black on the anonymized PDF. Choose a color from your logo or the suggested palette.",
    sloganLabel: "Slogan", optionalTag: "(optional)",
    sloganPlaceholder: "Recruiting is our craft",
    charsCount: (n: number) => `${n}/120 characters`,
    contactEmailLabel: "Contact email",
    contactEmailPlaceholder: "contact@your-firm.com",
    invalidEmailFormat: "Invalid email format",
    contactEmailHint: "Added to the footer of the anonymized CV. Lets the end client reach you.",
    requestPending: "Request being processed.",
    requestPendingBody: (date: string) => `Submitted on ${date}. You'll receive an email as soon as it's approved or rejected.`,
    requestApproved: "Change approved",
    onThe: (date: string) => ` on ${date}`,
    requestRejected: "Request rejected",
    locked: "Locked",
    changeRequestEyebrow: "Change request",
    changeRequestTitle: "Edit your locked information",
    changeRequestBody: "Check the information you'd like to change, then enter the new value for each. Our team will review your request within 24-48 business hours and reply by email.",
    whyThisStep: "Why this step?",
    whyThisStepBody: "The name, logo, and contact email appear on the anonymized CVs you present to your clients. To prevent identity theft of a firm, this information is locked 24 hours after your onboarding ends and any change requires manual validation.",
    undefined_: "(not set)",
    logoField: "Logo",
    currentLogo: "Current logo",
    noLogo: "No logo",
    current: "Current",
    new_: "New",
    toChoose: "To choose",
    uploading: "Uploading…",
    replaceFile: "Replace file",
    chooseFile: "Choose a file",
    reasonLabel: "Reason for the request",
    reasonPlaceholder: "E.g.: new brand positioning, merger, typo during signup…",
    checkAtLeastOne: "Check at least one item to change.",
    sendingRequest: "Sending…",
    sendRequest: "Send request",
    errorWithStatus: (status: number) => `Error ${status}`,
    currentPrefix: (v: string) => `Current: ${v}`,
    pricingPolicyTitle: "Pricing policy",
    pricingPolicySubtitle: "Target margins + standard benefits for your organization.",
    pricingPolicyReused: "Reused for every candidate × mission pricing.",
    marginsBenefitsLocations: "Margins, benefits, locations",
    configureDetails: "Configure the detailed settings.",
    configureArrow: "Configure →",
    invalidEmail: "Invalid email address.",
    inviteSendError: "Error while sending.",
    inviteSentTo: (email: string) => `Invitation sent to ${email}.`,
    revokeError: "Error while revoking.",
    removeConfirm: (label: string) => `Remove ${label} from the organization?`,
    allocateError: "Allocation failed.",
    deallocateConfirm: (label: string) => `Release ${label}'s seat? They'll remain in the organization but lose workspace access.`,
    deallocateError: "Release failed.",
    seatReleased: (label: string) => `${label}'s seat released.`,
    delegateOnLabel: "Settings",
    delegateOffLabel: "Delegate",
    delegateAddHint: "Let this member manage branding and the pricing policy",
    delegateRemoveHint: "Revoke this member's access to the configuration",
    delegateConfirm: (label: string) =>
      `Let ${label} edit the organisation's branding and pricing policy?\n\nThis grants no access to billing, seats or deletion.`,
    delegateOn: (label: string) => `${label} can now manage the configuration.`,
    delegateOff: (label: string) => `${label} no longer manages the configuration.`,
    delegateError: "Could not update the delegation.",
    members: "Members",
    seatsSubtitle: (used: number, total: number) => `${used} of ${total} seats · shared talent pool`,
    noFirstName: "No name",
    youSuffix: " · you",
    releaseThisSeat: "Release this seat",
    releaseAction: "Release",
    invitePending: "Invitation sent by email · pending",
    cancelAction: "Cancel",
    inviteEmailPlaceholder: "email@organization.com",
    send: "Send",
    emptySeat: "Empty seat",
    footerNote: "Invitations are sent by email. The member clicks the link they receive, chooses a password, and gets direct access to the workspace.",
    addMember: "+ Add a member",
    allocateSeatDropdown: "+ Allocate a seat ▾",
    inviteNewMember: "+ Invite a new member (email)",
    allocateToSelf: "Allocate myself a seat",
    allocateTo: (name: string) => `Allocate to ${name}`,
    ownerTag: "(owner)",
    deleteError: "Error while deleting.",
    cancelDeletionError: "Cancellation failed.",
    dangerZone: "Danger zone",
    deleteOrgBodyFull: <>Schedule the deletion of the organization and all its data. The workspace becomes read-only for <strong>30 days</strong> (time to export your data), then everything is permanently deleted. You can cancel anytime before the deadline.</>,
    deleteMyOrg: "Delete my organization",
    deleteOrgConfirmTitle: (name: string) => `Delete ${name}?`,
    deleteOrgConfirmBody: <>The organization becomes <strong>read-only</strong> and will be permanently deleted, along with all its data, in <strong>30 days</strong>. You (and your colleagues) can export the data and <strong>cancel</strong> the deletion anytime before the deadline.</>,
    typeOrgNameToConfirm: <>Type the organization name to confirm:</>,
    scheduleDeletion: "Schedule the deletion",
    scheduling: "Scheduling…",
    exportMyData: "Export my data",
    exportBody: "Download a JSON file with your entire organization: candidates, missions, matches, emails and settings. Keep it as an archive.",
    exportDisclaimer: "Due to product updates, we cannot guarantee full restoration of this data in a future version of the service.",
    preparing: "Preparing…",
    downloadJson: "Download JSON export",
  },
}

/**
 * /cabinet — owner-facing console.
 *
 * Reworked layout : we drop the old 7/5 split that pushed Subscription
 * and Pricing Policy below the fold. The console now spreads on a
 * 1440-wide canvas, three balanced columns at desktop sizes :
 *
 *   row 1 (12) : EmailConfirmation banner (only if user.email_confirmed_at null)
 *   row 2 (12) : Hero — cabinet identity + KPI pills
 *   row 3 (12) : MySeat banner
 *   row 4      : Subscription (4) | Members (4) | Identity (4)
 *   row 5      : Pricing Policy* (6) | Danger zone (6)
 *
 *   * Pricing Policy is hidden until the trial is activated — there's no
 *     point configuring margins before you can use the workspace.
 *
 * Down at <= 1100px we collapse to 2 columns, then 1 column on mobile.
 */

interface MemberRow {
  user_id: string
  first_name: string | null
  role: "owner" | "member"
  has_sourcing_seat: boolean
  /** Membre à qui l'owner a délégué le branding + la politique pricing. */
  can_manage_org_settings?: boolean
}

interface PendingInvite {
  id: string
  email: string
  role: "owner" | "member"
  expires_at: string
  created_at: string
}

export default function CabinetPage() {
  const { profile, organization, userEmail, emailConfirmed, isOwner, canManageSettings, refetch } = useCabinet()
  const router = useRouter()
  const searchParams = useSearchParams()
  const sb = useMemo(() => getSupabase(), [])

  const rawTab = searchParams.get("tab")
  const action = searchParams.get("action")
  const initialTab: OrgTab = (() => {
    // Si ?action=subscribe (deep-link depuis la bannière lockdown ou un
    // mail Stripe), on force l'onglet Abonnement où le SubscriptionCard
    // détectera le param et ouvrira directement le PlanPicker.
    if (action === "subscribe") return "abonnement"
    if (rawTab === "abonnement" || rawTab === "securite") return rawTab
    return "org"
  })()
  // L'onglet actif est piloté par un state local plutôt que dérivé live
  // de searchParams. Raison : en Next 16, router.replace avec un
  // pathname identique ne re-rend pas toujours les client components,
  // ce qui figeait le tab affiché après un refresh sur ?tab=abonnement
  // puis un clic sur le premier onglet. State local = UI réactive
  // instantanément, l'URL est synchronisée en background pour les
  // deep-links et le partage de lien.
  const [activeTab, setActiveTab] = useState<OrgTab>(initialTab)
  // Si l'URL change pour une raison externe (deep-link ?tab=…,
  // bouton retour navigateur), on resynchronise le state.
  useEffect(() => {
    setActiveTab(initialTab)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawTab, action])

  // Le tableau de bord reste fermé aux membres SAUF si l'owner leur a
  // délégué la configuration (migration 062). Un délégué n'accède qu'à
  // deux cartes — Branding et Politique pricing — le reste est masqué plus
  // bas, et le serveur refuse de toute façon les champs owner-only.
  useEffect(() => {
    if (!isOwner && !canManageSettings) router.replace("/workspace")
  }, [isOwner, canManageSettings, router])

  const [members, setMembers] = useState<MemberRow[]>([])
  const [invites, setInvites] = useState<PendingInvite[]>([])
  const [logoUrl, setLogoUrl] = useState<string | null>(null)

  const loadMembers = async () => {
    const { data } = await sb
      .from("profiles")
      .select("user_id, first_name, role, has_sourcing_seat, can_manage_org_settings")
      .eq("organization_id", organization.id)
      .order("role", { ascending: true })
    setMembers((data ?? []) as MemberRow[])
  }
  const loadInvites = async () => {
    const { data } = await sb
      .from("org_invites")
      .select("id, email, role, expires_at, created_at")
      .eq("organization_id", organization.id)
      .is("accepted_at", null)
      .order("created_at", { ascending: false })
    setInvites((data ?? []) as PendingInvite[])
  }

  useEffect(() => {
    void loadMembers()
    void loadInvites()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sb, organization.id])

  useEffect(() => {
    let mounted = true
    ;(async () => {
      if (!organization.brand_logo_path) { setLogoUrl(null); return }
      const { data } = await sb.storage.from("brand-logos")
        .createSignedUrl(organization.brand_logo_path, 60 * 60)
      if (mounted) setLogoUrl(data?.signedUrl ?? null)
    })()
    return () => { mounted = false }
  }, [sb, organization.brand_logo_path])

  // Seats used = members AYANT un siège alloué + invitations en attente.
  // Un owner sans siège alloué ne compte pas. Le toggle siège est piloté
  // par la MembersSection (allocation explicite).
  const seatsUsed = members.filter((m) => m.has_sourcing_seat).length + invites.length
  // La politique pricing appartient à la Suite Pricing (option payante) : elle
  // n'a de sens que pour qui y a droit. Le garde-fou existait mais était calculé
  // puis jeté (`void`) depuis un refactor → un client Sourcing seul voyait la
  // carte ET le wizard. On s'appuie désormais sur la règle produit unique.
  const canUsePricing = hasPricingAccess(organization, { isAdmin: profile.is_admin === true })

  // La visite guidée 6 étapes Package Sourcing est désormais déclenchée
  // sur /workspace (premier accès après souscription), pas ici --
  // c'est dans le workspace que les CTAs des étapes ont du sens.

  const orgDisplayName = organization.brand_name ?? organization.name

  return (
    <main style={{
      maxWidth: 1320, margin: "0 auto",
      padding: "28px 32px 64px",
      fontFamily: "var(--font-inter), sans-serif",
    }}>
      {!emailConfirmed && (
        <EmailConfirmationBanner email={userEmail} />
      )}

      {/* ── Tabs ──────────────────────────────────────────── */}
      <OrgTabs
        activeTab={activeTab}
        orgLabel={orgDisplayName}
        isOwner={isOwner}
        onChange={setActiveTab}
      />

      {/* ── Tab content ───────────────────────────────────── */}
      <div style={{ marginTop: 24 }}>
        <UpdatesHeroCard />
        {activeTab === "org" && (
          <div className="org-tab-grid" style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.1fr) minmax(0, 1fr)",
            gap: 18,
            // alignItems "stretch" + Card `height: 100%` font que les
            // deux cartes d'une même ligne s'alignent sur la plus grande.
            // Évite les décalages quand l'une est repliée et l'autre pas.
            alignItems: "stretch",
          }}>
            {/* Row 1 : Identité (vitrine read-only) | Membres */}
            <IdentitySection
              organization={organization}
              logoUrl={logoUrl}
            />
            {isOwner && <MembersSection
              members={members}
              invites={invites}
              seatsBudget={organization.subscription_seats ?? Math.max(organization.seats_total, seatsUsed, 1)}
              currentUserId={profile.user_id}
              userEmail={userEmail}
              isOwner={isOwner}
              onChange={() => { void loadInvites() }}
            />}
            {/* Row 2 : Branding pleine largeur (la politique pricing
                vit désormais dans l'onglet "Mes packages"). */}
            <div style={{ gridColumn: "1 / -1" }}>
              <BrandingSection
                organization={organization}
                logoUrl={logoUrl}
                isOwner={isOwner}
                onUpdated={refetch}
              />
            </div>
            {isOwner && (
              <div style={{ gridColumn: "1 / -1" }}>
                <PreviewToolsCard />
              </div>
            )}
            {/* Pour l'owner, la politique pricing reste dans l'onglet
                « packages », à côté de l'abonnement. Un délégué n'a pas cet
                onglet : on la lui sert ici, sinon la moitié de sa délégation
                serait inaccessible. */}
            {!isOwner && canManageSettings && canUsePricing && (
              <div style={{ gridColumn: "1 / -1" }}>
                <PricingPolicySectionCollapsible />
              </div>
            )}
            <style>{`
              @media (max-width: 980px) {
                .org-tab-grid { grid-template-columns: 1fr !important; }
              }
            `}</style>
          </div>
        )}

        {activeTab === "abonnement" && isOwner && (
          <div style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) minmax(260px, 340px)",
            gap: 20,
            alignItems: "start",
          }}>
            {/* Colonne gauche : siège + abonnement + politique pricing */}
            <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
              <MySeatBanner
                hasSeat={profile.has_sourcing_seat}
                hasAccess={hasActiveAccess(organization, { isAdmin: profile.is_admin === true })}
                onToggle={refetch}
                isOwner={isOwner}
              />
              <SubscriptionCard
                organization={organization}
                onActivated={refetch}
                isOwner={isOwner}
                isAdmin={profile.is_admin === true}
                autoOpenPicker={action === "subscribe"}
              />
              {canUsePricing && <PricingPolicySectionCollapsible />}
            </div>
            {/* Colonne droite : utilisation (sticky pour rester visible
                pendant le scroll des cartes de gauche) */}
            <div style={{ position: "sticky", top: 16 }}>
              <QuotaGauges />
            </div>
          </div>
        )}

        {activeTab === "securite" && isOwner && (
          <div style={{ maxWidth: 720, display: "grid", gap: 16 }}>
            <ExportDataCard />
            {isOwner && (
              <TransferOwnershipCard
                currentUserId={profile.user_id}
                onTransferred={refetch}
              />
            )}
            <DangerSection
              organization={organization}
              isOwner={isOwner}
              onChanged={refetch}
            />
          </div>
        )}
      </div>

      {canUsePricing && (
        <PricingOnboardingGate organization={organization} onDone={refetch} />
      )}
    </main>
  )
}

/**
 * Affiche le wizard pricing une fois pour l'owner après souscription.
 * Conditions cumulatives :
 *   - cabinet_onboarded_at non null (l'onboarding org est fini)
 *   - pricing_onboarded_at null (jamais configuré le pricing)
 *   - hasActiveAccess vrai (trial actif OU sub active OU trialing Stripe)
 *
 * Le wizard est dismissable ("Plus tard") sans stamper — il revient à la
 * prochaine visite tant que pricing_onboarded_at est NULL.
 */
function PricingOnboardingGate({
  organization, onDone,
}: { organization: Organization; onDone: () => Promise<void> }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!organization.cabinet_onboarded_at) return
    if (organization.pricing_onboarded_at) return
    if (!hasActiveAccess(organization)) return
    // Léger délai pour ne pas afficher la modale à la frame 0 après un
    // signup/checkout : laisse la page s'installer + évite le clignement.
    const t = window.setTimeout(() => setOpen(true), 700)
    return () => window.clearTimeout(t)
  }, [organization])

  return (
    <PricingOnboardingWizard
      open={open}
      initial={{
        margeMin: organization.pricing_margin_min_pct,
        margeTarget: organization.pricing_margin_target_pct,
        rttDays: organization.pricing_rtt_days_per_year,
        avantages: organization.pricing_default_avantages,
      }}
      onClose={() => setOpen(false)}
      onDone={onDone}
    />
  )
}

/* ────────────────────────────────────────────────────────────────── */
/* OrgTabs — barre d'onglets de la console                              */
/* ────────────────────────────────────────────────────────────────── */

type OrgTab = "org" | "abonnement" | "securite"

function OrgTabs({
  activeTab, orgLabel, isOwner, onChange,
}: {
  activeTab: OrgTab
  orgLabel: string
  /** Un délégué ne voit QUE l'onglet organisation : les onglets
   *  « packages » (prix, facturation) et « sécurité » (suppression,
   *  transfert de propriété) restent réservés au propriétaire. */
  isOwner: boolean
  /** Bascule le state d'activeTab dans le parent. La synchro URL se fait
   *  en plus via history.replaceState pour ne pas casser le partage de
   *  lien / les deep-links, mais sans dépendre du re-render Next. */
  onChange: (next: OrgTab) => void
}) {
  const { lang } = useLanguage()
  const t = copy[lang]
  // L'URL param reste "abonnement" pour ne pas casser les deep-links
  // historiques (mails Stripe, lockdown banner) — seul le label change.
  const tabs: { id: OrgTab; label: string }[] = [
    { id: "org", label: orgLabel || t.orgFallback },
    ...(isOwner
      ? ([
          { id: "abonnement", label: t.tabPackages },
          { id: "securite", label: t.tabSecurity },
        ] as { id: OrgTab; label: string }[])
      : []),
  ]

  // Source de vérité = state parent (réactif instantanément).
  // On met à jour l'URL en parallèle via history.replaceState pour
  // garder le query string en phase pour les deep-links, MAIS sans
  // déclencher router.replace : Next 16 a un cache agressif qui peut
  // figer le render quand le pathname est identique. history natif
  // contourne ça sans toucher au rendu.
  const goTo = (id: OrgTab) => {
    onChange(id)
    const href = id === "org" ? "/organisation" : `/organisation?tab=${id}`
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", href)
    }
  }

  return (
    <nav
      role="tablist"
      style={{
        display: "flex", gap: 4,
        borderBottom: "1px solid var(--nw-border)",
        overflowX: "auto",
      }}
    >
      {tabs.map((t) => {
        const active = activeTab === t.id
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => goTo(t.id)}
            style={{
              position: "relative",
              padding: "12px 18px",
              fontSize: 14,
              fontWeight: active ? 700 : 500,
              color: active ? "var(--nw-text)" : "var(--nw-text-muted)",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontFamily: "inherit",
              whiteSpace: "nowrap",
              transition: "color 140ms",
              letterSpacing: t.id === "org" ? "-0.01em" : "0",
            }}
          >
            {t.label}
            {active && (
              <span
                aria-hidden
                style={{
                  position: "absolute",
                  left: 14, right: 14, bottom: -1,
                  height: 2,
                  background: "var(--nw-primary)",
                  borderRadius: 2,
                }}
              />
            )}
          </button>
        )
      })}
    </nav>
  )
}

/* ────────────────────────────────────────────────────────────────── */
/* Email confirmation                                                   */
/* ────────────────────────────────────────────────────────────────── */

function EmailConfirmationBanner({ email }: { email: string }) {
  const { lang } = useLanguage()
  const t = copy[lang]
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Cooldown : empêche un user de spammer le bouton "Renvoyer". Sinon
  // 50 clics = 50 emails Resend = risque blacklist du domaine d'envoi.
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown <= 0) return
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => window.clearTimeout(t)
  }, [cooldown])

  const resend = async () => {
    if (cooldown > 0 || busy) return
    setBusy(true); setError(null)
    try {
      const { error: err } = await getSupabase().auth.resend({
        type: "signup",
        email,
      })
      if (err) throw err
      setSent(true)
      setCooldown(30)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t.resendFailed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section style={{
      padding: "11px 16px",
      marginBottom: 14,
      borderRadius: 12,
      background: "linear-gradient(90deg, rgba(254,243,199,0.95) 0%, rgba(253,230,138,0.85) 100%)",
      border: "1px solid rgba(217,119,6,0.30)",
      display: "flex", alignItems: "center", gap: 12,
      flexWrap: "wrap",
      fontSize: 13,
      color: "var(--nw-warn-strong)",
    }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} aria-hidden>
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
        <polyline points="22,6 12,13 2,6" />
      </svg>
      <span style={{ flex: 1, minWidth: 220 }}>
        <strong style={{ color: "#7C2D12" }}>{t.confirmEmailTitle}</strong>
        {" : "}
        {t.confirmEmailBody(email)}
      </span>
      {sent && cooldown > 0 ? (
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--nw-success)", whiteSpace: "nowrap" }}>
          {t.emailResent(cooldown)}
        </span>
      ) : (
        <button
          type="button"
          onClick={resend}
          disabled={busy || cooldown > 0}
          style={{
            padding: "6px 12px", borderRadius: 8,
            border: "1px solid rgba(217,119,6,0.40)",
            background: "white", color: "var(--nw-warn-strong)",
            fontSize: 12, fontWeight: 700,
            cursor: busy ? "wait" : cooldown > 0 ? "not-allowed" : "pointer",
            fontFamily: "inherit",
            whiteSpace: "nowrap",
            opacity: cooldown > 0 ? 0.6 : 1,
          }}
        >
          {busy ? t.sending : t.resendLink}
        </button>
      )}
      {error && (
        <span style={{ width: "100%", fontSize: 12, color: "var(--nw-danger-strong)", marginTop: 4 }}>
          {error}
        </span>
      )}
    </section>
  )
}

/* ────────────────────────────────────────────────────────────────── */
/* Mon siège                                                            */
/* ────────────────────────────────────────────────────────────────── */

function MySeatBanner({ hasSeat, hasAccess, onToggle, isOwner }: {
  hasSeat: boolean
  /** Accès réel au workspace (trial actif / sub active / admin). Un siège
   *  n'ouvre l'accès que si l'org a un accès actif — sinon le workspace
   *  rebondit sur /organisation. */
  hasAccess: boolean
  onToggle: () => Promise<void>
  isOwner: boolean
}) {
  const router = useRouter()
  const { lang } = useLanguage()
  const t = copy[lang]
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const allocate = async () => {
    setBusy(true); setError(null)
    const res = await fetch("/api/cabinet/seat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ allocate: true }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({} as { error?: string }))
      setError(j.error ?? t.allocationError)
      setBusy(false)
      return
    }
    await onToggle()
    router.replace("/workspace")
  }

  const release = async () => {
    if (!confirm(t.releaseConfirm)) return
    setBusy(true); setError(null)
    const res = await fetch("/api/cabinet/seat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ allocate: false }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({} as { error?: string }))
      setError(j.error ?? t.genericError)
    } else {
      await onToggle()
    }
    setBusy(false)
  }

  // Siège occupé MAIS accès suspendu (essai terminé / abonnement inactif) :
  // ne pas promettre "Accès complet" ni "Ouvrir le workspace" (qui rebondit
  // vers /organisation). On renvoie vers la souscription, juste en dessous.
  if (hasSeat && !hasAccess) {
    return (
      <section style={{
        padding: "12px 18px",
        background: "rgba(245,158,11,0.08)",
        border: "1px solid rgba(245,158,11,0.30)",
        borderRadius: 12,
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
        flexWrap: "wrap",
      }}>
        <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#F59E0B", flexShrink: 0 }} />
          <div>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--nw-warn-strong)" }}>
              Vous occupez un siège, mais votre accès est suspendu.
            </p>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--nw-warn-strong)" }}>
              Souscrivez ci-dessous pour rouvrir l&apos;accès au workspace.
            </p>
          </div>
        </div>
        {isOwner && (
          <button type="button" onClick={release} disabled={busy} style={smallBtnGhost}>
            {busy ? "…" : "Libérer le siège"}
          </button>
        )}
        {error && <p style={{ width: "100%", margin: 0, fontSize: 12, color: "#EF4444" }}>{error}</p>}
      </section>
    )
  }

  if (hasSeat) {
    return (
      <section style={{
        padding: "12px 18px",
        background: "rgba(34,197,94,0.06)",
        border: "1px solid rgba(34,197,94,0.25)",
        borderRadius: 12,
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
        flexWrap: "wrap",
      }}>
        <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{
            width: 8, height: 8, borderRadius: "50%",
            background: "#22C55E", flexShrink: 0,
          }} />
          <div>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--nw-success)" }}>
              {t.seatOccupiedTitle}
            </p>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: "#166534" }}>
              {t.seatOccupiedBody}
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={() => router.push("/workspace")} style={smallBtnPrimary}>
            {t.openWorkspaceArrow}
          </button>
          {isOwner && (
            <button type="button" onClick={release} disabled={busy} style={smallBtnGhost}>
              {busy ? "…" : t.releaseSeat}
            </button>
          )}
        </div>
        {error && <p style={{ width: "100%", margin: 0, fontSize: 12, color: "#EF4444" }}>{error}</p>}
      </section>
    )
  }

  return (
    <section style={{
      padding: "14px 18px",
      background: "linear-gradient(135deg, rgba(124,99,200,0.06) 0%, rgba(184,174,222,0.10) 100%)",
      border: "1px solid rgba(124,99,200,0.25)",
      borderRadius: 12,
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
      flexWrap: "wrap",
    }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{ margin: 0, fontSize: 13.5, fontWeight: 800, color: "var(--nw-text)" }}>
          {t.noSeatTitle}
        </p>
        <p style={{ margin: "3px 0 0", fontSize: 12, color: "var(--nw-text-muted)", lineHeight: 1.5 }}>
          {t.noSeatBody}
        </p>
      </div>
      <button type="button" onClick={allocate} disabled={busy || !isOwner}
        style={{
          ...smallBtnPrimary,
          padding: "10px 16px", fontSize: 12.5,
          opacity: !isOwner ? 0.5 : 1,
        }}>
        {busy ? t.allocating : t.allocateSelf}
      </button>
      {error && <p style={{ width: "100%", margin: 0, fontSize: 12, color: "#EF4444" }}>{error}</p>}
    </section>
  )
}

/* ────────────────────────────────────────────────────────────────── */
/* Hero bits                                                            */
/* ────────────────────────────────────────────────────────────────── */

// HeroAvatar / HeroPill supprimés avec le hero — l'org info est désormais
// portée par l'onglet org lui-même.

/* ────────────────────────────────────────────────────────────────── */
/* Subscription (trial-aware)                                          */
/* ────────────────────────────────────────────────────────────────── */

function SubscriptionCard({
  organization, onActivated, isOwner, isAdmin = false, autoOpenPicker = false,
}: {
  organization: Organization
  onActivated: () => Promise<void>
  isOwner: boolean
  /** Admin Naywa : accès permanent — on n'affiche pas le panneau rouge
   *  "Période d'essai terminée" (il contredisait la carte verte "Accès
   *  complet au workspace" juste au-dessus). */
  isAdmin?: boolean
  /** Si true (deep-link ?action=subscribe), ouvre le PlanPicker en mode
   *  paid dès le mount. Évite à l'owner de cliquer 2x après un lockdown. */
  autoOpenPicker?: boolean
}) {
  const { lang } = useLanguage()
  const t = copy[lang]
  const locale = lang === "fr" ? "fr-FR" : "en-US"
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pickerMode, setPickerMode] = useState<"closed" | "paid">(
    autoOpenPicker && isOwner ? "paid" : "closed",
  )

  // Résiliation demandée au portail : l'abo court jusqu'à la fin de la période
  // payée. On l'annonce comme une FIN, pas comme un prochain prélèvement.
  const scheduledCancel = scheduledCancellation(organization)

  // Activation directe du trial app-side. Aucun appel Stripe — la
  // structure reçoit 15 jours d'accès complet plafonnés à 2 sièges.
  // Au-delà, l'owner doit cliquer "Souscrire" pour passer au paid.
  const activateTrial = async () => {
    setBusy(true); setError(null)
    try {
      const r = await fetch("/api/cabinet/activate-trial", { method: "POST" })
      if (!r.ok) {
        const j = await r.json().catch(() => ({} as { error?: string }))
        throw new Error(j.error ?? t.activationFailed)
      }
      await onActivated()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t.genericError)
    } finally {
      setBusy(false)
    }
  }
  const trial = trialStatus(organization)
  const access = subscriptionAccess(organization)
  const hasStripeSub =
    organization.subscription_status === "active" ||
    organization.subscription_status === "trialing" ||
    organization.subscription_status === "past_due"

  if (organization.pending_deletion_at) {
    const date = new Date(organization.pending_deletion_at).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" })
    const cancelDeletion = async () => {
      setBusy(true); setError(null)
      try {
        const r = await fetch("/api/cabinet/cancel-deletion", { method: "POST" })
        if (!r.ok) {
          const j = await r.json().catch(() => ({} as { error?: string }))
          throw new Error(j.error ?? t.cancelDeletionFailed)
        }
        await onActivated()
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : t.genericError)
      } finally {
        setBusy(false)
      }
    }
    return (
      <Card title={t.subscription} subtitle={t.subStatusSubtitle}>
        <Panel tone="warn">
          <p style={panelTitle("#D97706")}>{t.deletionScheduled}</p>
          <p style={panelBody("var(--nw-warn-strong)")}>
            {t.orgWillBeDeletedReadOnly(date)}
          </p>
          {isOwner && (
            <button type="button" onClick={cancelDeletion} disabled={busy} style={{ ...ctaSecondaryBtn(busy), marginTop: 12 }}>
              {busy ? t.cancelling : t.cancelDeletion}
            </button>
          )}
          {error && <p style={{ margin: "8px 0 0", fontSize: 12.5, color: "var(--nw-danger-strong)" }}>{error}</p>}
        </Panel>
      </Card>
    )
  }

  const openPortal = async () => {
    setBusy(true); setError(null)
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" })
      const j = await res.json().catch(() => ({} as { url?: string; error?: string }))
      if (!res.ok || !j.url) throw new Error(j.error ?? t.portalUnavailable)
      window.location.href = j.url
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t.genericError)
      setBusy(false)
    }
  }

  return (
    <>
      <Card title={t.subscription} subtitle={t.subSubtitle}>
        {/* Stripe sub — affichage prioritaire si présente */}
        {hasStripeSub && (
          <Panel tone={scheduledCancel ? "warn" : access.state === "paid" ? "success" : access.state === "trialing" ? "brand" : "warn"}>
            <p style={panelTitle(scheduledCancel ? "var(--nw-warn)" : access.state === "paid" ? "var(--nw-success)" : access.state === "trialing" ? "var(--nw-primary)" : "var(--nw-danger-strong)")}>
              {scheduledCancel ? t.cancellationScheduled : planLabel(organization, lang)}
            </p>
            <p style={panelBody("var(--nw-text-body)")}>
              {organization.subscription_status === "past_due"
                ? t.paymentFailed
                : scheduledCancel
                  // Résilié au portail : accès complet jusqu'à la fin de la
                  // période DÉJÀ payée — surtout pas « prochain prélèvement ».
                  ? t.scheduledCancelBody(
                      planLabel(organization, lang),
                      scheduledCancel.endsAt.toLocaleDateString(locale, { day: "numeric", month: "long" }),
                      GRACE_DAYS,
                    )
                  : access.state === "trialing" && "until" in access
                    ? t.trialUntil(access.until?.toLocaleDateString(locale, { day: "numeric", month: "long" }) ?? "")
                    : access.state === "paid" && "until" in access
                      ? t.nextCharge(access.until?.toLocaleDateString(locale, { day: "numeric", month: "long" }) ?? "")
                      : null}
            </p>
            <button
              type="button"
              onClick={openPortal}
              disabled={busy || !isOwner}
              style={scheduledCancel ? ctaPrimaryBtn(busy) : ctaSecondaryBtn(busy)}
            >
              {busy
                ? t.openingPortal
                : scheduledCancel ? t.resumeSubscription : t.manageSubscription}
            </button>
            <PricingAddonToggle
              organization={organization}
              isOwner={isOwner}
              onChanged={onActivated}
            />
          </Panel>
        )}

        {/* Pas de Stripe sub — pending : pas encore d'essai activé. */}
        {!hasStripeSub && trial.state === "pending" && (
          <Panel tone="brand">
            <p style={panelTitle("var(--nw-primary)")}>{t.noActiveSubscription}</p>
            <p style={panelBody("var(--nw-text-body)")}>
              {t.startTrialBody(TRIAL_DURATION_DAYS, TRIAL_SEAT_CAP)}
            </p>
            <button
              type="button"
              onClick={activateTrial}
              disabled={!isOwner || busy}
              style={ctaPrimaryBtn(busy)}
            >
              {busy ? t.activating : t.startFreeTrial(TRIAL_DURATION_DAYS)}
            </button>
            <button
              type="button"
              onClick={() => setPickerMode("paid")}
              disabled={!isOwner || busy}
              style={{ ...ctaSecondaryBtn(false), marginTop: 8 }}
            >
              {t.subscribeToPlan}
            </button>
          </Panel>
        )}

        {/* Trial actif — l'owner peut souscrire pour passer au paid (et
            débloquer plus de 2 sièges). */}
        {!hasStripeSub && trial.state === "active" && (
          <Panel tone="success">
            <p style={panelTitle("var(--nw-success)")}>
              {t.trialActive(trial.daysLeft)}
            </p>
            <p style={panelBody("#166534")}>
              {t.trialEndsOn(trial.endsAt?.toLocaleDateString(locale, { day: "numeric", month: "long" }) ?? "", TRIAL_SEAT_CAP)}
            </p>
            <button
              type="button"
              onClick={() => setPickerMode("paid")}
              disabled={!isOwner}
              style={ctaPrimaryBtn(false)}
            >
              {t.subscribeToPlanArrow}
            </button>
          </Panel>
        )}

        {!hasStripeSub && trial.state === "expired" && isAdmin && (
          <Panel tone="brand">
            <p style={panelTitle("var(--nw-primary)")}>{t.adminAccountTitle}</p>
            <p style={panelBody("var(--nw-text-body)")}>
              {t.adminAccountBody}
            </p>
          </Panel>
        )}

        {!hasStripeSub && trial.state === "expired" && !isAdmin && (
          <Panel tone="warn">
            <p style={panelTitle("var(--nw-danger-strong)")}>{t.trialEndedTitle}</p>
            <p style={panelBody("#7F1D1D")}>
              {t.trialEndedBody}
            </p>
            <button
              type="button"
              onClick={() => setPickerMode("paid")}
              disabled={!isOwner}
              style={{
                ...ctaPrimaryBtn(false),
                background: "linear-gradient(120deg, var(--nw-danger-strong) 0%, var(--nw-danger-strong) 100%)",
                boxShadow: "0 6px 16px -4px rgba(220,38,38,0.40)",
              }}
            >
              {t.subscribeArrow}
            </button>
          </Panel>
        )}

        {error && (
          <p style={{ margin: "10px 0 0", fontSize: 12, color: "var(--nw-danger-strong)" }}>{error}</p>
        )}

        <div style={{ marginTop: 14, fontSize: 11.5, color: "var(--nw-text-muted)", lineHeight: 1.55 }}>
          {t.seatsAllocated(organization.seats_total)}
        </div>
      </Card>

      {pickerMode === "paid" && (
        <PlanPickerModal
          initialSeats={organization.subscription_seats ?? Math.max(organization.seats_total, 1)}
          initialPricing={organization.subscription_has_pricing === true}
          onClose={() => setPickerMode("closed")}
        />
      )}
    </>
  )
}

function planLabel(org: Organization, lang: Lang): string {
  const t = copy[lang]
  const seats = org.subscription_seats ?? 1
  const base = `Package Sourcing · ${seats} ${t.personLabel(seats)}`
  return org.subscription_has_pricing ? `${base} · Suite Pricing` : base
}

const ctaPrimaryBtn = (busy: boolean): React.CSSProperties => ({
  marginTop: 10,
  padding: "10px 16px",
  borderRadius: 10,
  border: "none",
  background: "linear-gradient(120deg, var(--nw-primary) 0%, var(--nw-primary-dark) 100%)",
  color: "white",
  fontSize: 13,
  fontWeight: 700,
  cursor: busy ? "wait" : "pointer",
  opacity: busy ? 0.7 : 1,
  boxShadow: "0 6px 16px -4px rgba(124,99,200,0.45)",
  fontFamily: "inherit",
  width: "100%",
})
const ctaSecondaryBtn = (busy: boolean): React.CSSProperties => ({
  marginTop: 10,
  padding: "9px 14px",
  borderRadius: 10,
  border: "1px solid rgba(124,99,200,0.30)",
  background: "white",
  color: "var(--nw-primary)",
  fontSize: 12.5,
  fontWeight: 700,
  cursor: busy ? "wait" : "pointer",
  opacity: busy ? 0.7 : 1,
  fontFamily: "inherit",
  width: "100%",
})

/* ────────────────────────────────────────────────────────────────── */
/* Suite Pricing — activation/retrait sur l'abonnement en cours        */
/* ────────────────────────────────────────────────────────────────── */

/**
 * L'option n'était réglable qu'au checkout : un client qui démarrait sans, puis
 * se mettait à faire de la régie, aurait dû résilier et re-souscrire. On la
 * vend pourtant comme activable à tout moment (CGU §6, FAQ tarifs) — c'était
 * donc une promesse non tenue. Ici, un clic ajoute ou retire la ligne d'abo,
 * proratisée par Stripe.
 */
function PricingAddonToggle({
  organization, isOwner, onChanged,
}: {
  organization: Organization
  isOwner: boolean
  onChanged: () => Promise<void>
}) {
  const { lang } = useLanguage()
  const t = copy[lang]
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // État optimiste : après un POST réussi, la ligne Stripe existe (ou n'existe
  // plus) — c'est un fait, pas une supposition. On le reflète tout de suite au
  // lieu d'attendre le webhook, dont la latence (surtout en test) ferait
  // clignoter le bouton sur l'ancien état. `null` = on suit la base.
  const [optimistic, setOptimistic] = useState<boolean | null>(null)
  const [syncing, setSyncing] = useState(false)
  const active = optimistic ?? organization.subscription_has_pricing === true

  const toggle = async () => {
    const target = !active
    setBusy(true); setError(null)
    try {
      const res = await fetch("/api/stripe/pricing-addon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enable: target }),
      })
      const j = await res.json().catch(() => ({} as { message?: string }))
      if (!res.ok) throw new Error(j.message ?? t.addonToggleFailed)
      // Succès Stripe confirmé → on affiche le nouvel état immédiatement.
      setOptimistic(target)
      // Le webhook écrit la base en arrière-plan ; on rafraîchit sans bloquer
      // l'UI. Quand la base rattrape, `optimistic` et la base coïncident.
      setSyncing(true)
      onChanged().finally(() => setSyncing(false))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t.genericError)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{
      marginTop: 12, paddingTop: 12,
      borderTop: "1px solid rgba(124,99,200,0.18)",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: "var(--nw-text)" }}>
            Suite Pricing Syntec
          </p>
          <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--nw-text-muted)" }}>
            {syncing
              ? t.addonSyncing
              : active
                ? t.addonIncluded(formatEur(PRICING_ADDON_EUR))
                : t.addonOptional(formatEur(PRICING_ADDON_EUR))}
          </p>
        </div>
        <button
          type="button"
          onClick={toggle}
          disabled={busy || !isOwner}
          style={{
            flexShrink: 0,
            padding: "7px 13px", borderRadius: 9,
            border: active ? "1px solid var(--nw-primary-100)" : "none",
            background: active ? "white" : "linear-gradient(120deg, var(--nw-primary) 0%, var(--nw-primary-dark) 100%)",
            color: active ? "var(--nw-text-muted)" : "white",
            fontSize: 12, fontWeight: 700,
            cursor: busy || !isOwner ? "not-allowed" : "pointer",
            opacity: busy || !isOwner ? 0.6 : 1,
            fontFamily: "inherit",
          }}
        >
          {busy ? "…" : active ? t.removeAddon : t.activateAddon}
        </button>
      </div>
      {!isOwner && (
        <p style={{ margin: "6px 0 0", fontSize: 10.5, color: "var(--nw-text-muted)" }}>
          {t.ownerOnlySubscription}
        </p>
      )}
      {error && (
        <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--nw-danger-strong)" }}>{error}</p>
      )}
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────── */
/* Plan Picker Modal — Stripe Checkout entry point                     */
/* ────────────────────────────────────────────────────────────────── */

function PlanPickerModal({
  initialSeats, initialPricing, onClose,
}: {
  initialSeats: number
  initialPricing: boolean
  onClose: () => void
}) {
  useEscapeKey(onClose)
  const { lang } = useLanguage()
  const t = copy[lang]
  const [seats, setSeats] = useState<number>(Math.max(1, initialSeats))
  const [withPricing, setWithPricing] = useState<boolean>(initialPricing)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Au-delà du plafond self-service, on ne vend plus en ligne : le CTA bascule
  // sur la prise de RDV. Le serveur applique la même règle (cf. checkout).
  const selfServe = isSelfServeSeats(seats)
  const total = monthlyTotalEur(seats, withPricing)

  const subscribe = async () => {
    setBusy(true); setError(null)
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seats, withPricing }),
      })
      const j = await res.json().catch(() => ({} as { url?: string; error?: string }))
      if (!res.ok || !j.url) throw new Error(j.error ?? t.checkoutUnavailable)
      window.location.href = j.url
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t.genericError)
      setBusy(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(17,24,39,0.40)",
        backdropFilter: "blur(2px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
      }}
    >
      <m.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: EASE }}
        style={{
          background: "white",
          borderRadius: 20,
          padding: "28px 28px 24px",
          maxWidth: 520,
          width: "100%",
          boxShadow: "0 24px 64px -24px rgba(17,24,39,0.30)",
          fontFamily: "var(--font-inter), sans-serif",
        }}
      >
        <header style={{ marginBottom: 18 }}>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "var(--nw-primary)", letterSpacing: "0.10em", textTransform: "uppercase" }}>
            {t.subscribeToTitle}
          </p>
          <h2 style={{ margin: "6px 0 0", fontSize: 22, fontWeight: 800, color: "var(--nw-text)", letterSpacing: "-0.02em" }}>
            {t.chooseYourPlan}
          </h2>
        </header>

        {/* Nombre de personnes — saisie libre, plus un palier à choisir */}
        <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 700, color: "var(--nw-text-body)", letterSpacing: "0.01em" }}>
          {t.howManyPeople}
        </p>
        <div style={{
          display: "flex", alignItems: "center", gap: 12, marginBottom: 6,
        }}>
          <div style={{
            display: "flex", alignItems: "center",
            border: "1px solid var(--nw-primary-100)", borderRadius: 12, overflow: "hidden",
          }}>
            <button
              type="button"
              onClick={() => setSeats((n) => Math.max(1, n - 1))}
              disabled={seats <= 1}
              aria-label={t.removePerson}
              style={stepperBtn(seats <= 1)}
            >
              −
            </button>
            <input
              type="number"
              min={1}
              value={seats}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10)
                setSeats(Number.isNaN(n) ? 1 : Math.max(1, Math.min(99, n)))
              }}
              aria-label={t.numberOfPeople}
              style={{
                width: 58, border: "none", outline: "none", textAlign: "center",
                fontSize: 18, fontWeight: 800, color: "var(--nw-text)",
                fontFamily: "inherit", fontVariantNumeric: "tabular-nums",
                padding: "10px 0", background: "white",
              }}
            />
            <button
              type="button"
              onClick={() => setSeats((n) => Math.min(99, n + 1))}
              aria-label={t.addPerson}
              style={stepperBtn(false)}
            >
              +
            </button>
          </div>
          {selfServe && (
            <span style={{ fontSize: 12, color: "var(--nw-text-muted)" }}>
              {t.thatIs("")}<strong style={{ color: "var(--nw-text)" }}>{formatEur(priceForSeats(seats))}</strong>
              {seats > 1 && t.perPersonSuffix(formatEur(priceForSeats(seats) / seats))}
            </span>
          )}
        </div>
        <p style={{ margin: "0 0 18px", fontSize: 11, color: "var(--nw-text-muted)" }}>
          {t.seatDiscountHint}
        </p>

        {/* Option Suite Pricing — un interrupteur, pas un plan à part */}
        <button
          type="button"
          onClick={() => setWithPricing((v) => !v)}
          aria-pressed={withPricing}
          style={{
            width: "100%", display: "flex", alignItems: "flex-start", gap: 11,
            padding: "13px 14px", marginBottom: 18,
            borderRadius: 14,
            border: withPricing ? "2px solid var(--nw-primary)" : "1px solid var(--nw-primary-100)",
            background: withPricing ? "rgba(124,99,200,0.08)" : "white",
            cursor: "pointer", textAlign: "left", fontFamily: "inherit",
          }}
        >
          <span
            aria-hidden
            style={{
              flexShrink: 0, marginTop: 1,
              width: 18, height: 18, borderRadius: 5,
              border: withPricing ? "none" : "1.5px solid #C9BEE8",
              background: withPricing ? "var(--nw-primary)" : "white",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
            }}
          >
            {withPricing && (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white"
                strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            )}
          </span>
          <span style={{ flex: 1 }}>
            <span style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: "var(--nw-text)" }}>
                Suite Pricing Syntec
              </span>
              <span style={{ fontSize: 12.5, fontWeight: 800, color: "var(--nw-primary)", whiteSpace: "nowrap" }}>
                + {formatEur(PRICING_ADDON_EUR)}
              </span>
            </span>
            <span style={{ display: "block", marginTop: 3, fontSize: 11.5, color: "var(--nw-text-muted)", lineHeight: 1.45 }}>
              {t.pricingAddonExtra}
            </span>
          </span>
        </button>

        {/* Récap */}
        {selfServe ? (
          <div style={{
            background: "linear-gradient(120deg, var(--nw-bg) 0%, var(--nw-border-soft) 100%)",
            border: "1px solid var(--nw-primary-100)",
            borderRadius: 14,
            padding: "14px 16px",
            marginBottom: 16,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontSize: 13, color: "var(--nw-text-body)", fontWeight: 600 }}>
                {t.monthlyTotalExclTax}
              </span>
              <span style={{ fontSize: 22, fontWeight: 800, color: "var(--nw-text)", letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>
                {formatEur(total)}
              </span>
            </div>
            <div style={{
              marginTop: 10, paddingTop: 10,
              borderTop: "1px solid rgba(124,99,200,0.18)",
              display: "flex", justifyContent: "space-between", alignItems: "center",
              fontSize: 11.5, color: "#5C46A0", fontWeight: 600,
              flexWrap: "wrap", gap: 6,
            }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7"/>
                  <path d="M3 7l9 6 9-6"/>
                  <rect x="3" y="5" width="18" height="2"/>
                </svg>
                {t.cvIncluded(cvIncludedForSeats(seats).toLocaleString(lang === "fr" ? "fr-FR" : "en-US"))}
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M20 6 9 17l-5-5"/>
                </svg>
                {t.unlimitedMatchings}
              </span>
            </div>
          </div>
        ) : (
          <div style={{
            background: "#FFFBEB",
            border: "1px solid #FDE68A",
            borderRadius: 14,
            padding: "14px 16px",
            marginBottom: 16,
          }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: "var(--nw-warn-strong)" }}>
              {t.talkAboutItTitle(seats)}
            </p>
            <p style={{ margin: "4px 0 0", fontSize: 11.5, color: "var(--nw-warn-strong)", lineHeight: 1.5 }}>
              {t.talkAboutItBody(MAX_SELF_SERVE_SEATS)}
            </p>
          </div>
        )}

        {selfServe && (
          <p style={{ margin: "0 0 16px", fontSize: 11.5, color: "var(--nw-text-muted)", lineHeight: 1.55 }}>
            {t.noVatNote}
          </p>
        )}

        {error && (
          <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--nw-danger-strong)" }}>{error}</p>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            style={{
              flex: 1,
              padding: "12px 16px",
              borderRadius: 12,
              border: "1px solid var(--nw-primary-100)",
              background: "white",
              color: "var(--nw-text-muted)",
              fontSize: 13.5,
              fontWeight: 600,
              cursor: busy ? "wait" : "pointer",
              fontFamily: "inherit",
            }}
          >
            {t.cancel}
          </button>
          {selfServe ? (
            <button
              type="button"
              onClick={subscribe}
              disabled={busy}
              style={ctaModalBtn(busy)}
            >
              {busy ? t.redirecting : t.continueWithPrice(formatEur(total))}
            </button>
          ) : (
            <a href="/contact-equipe" style={{ ...ctaModalBtn(false), textDecoration: "none", textAlign: "center" }}>
              {t.bookAppointment}
            </a>
          )}
        </div>
      </m.div>
    </div>
  )
}

const ctaModalBtn = (busy: boolean): React.CSSProperties => ({
  flex: 2,
  padding: "12px 16px",
  borderRadius: 12,
  border: "none",
  background: "linear-gradient(120deg, var(--nw-primary) 0%, var(--nw-primary-dark) 100%)",
  color: "white",
  fontSize: 14,
  fontWeight: 700,
  cursor: busy ? "wait" : "pointer",
  opacity: busy ? 0.7 : 1,
  boxShadow: "0 8px 24px -6px rgba(124,99,200,0.55)",
  fontFamily: "inherit",
})

/** Boutons − / + du sélecteur de personnes. */
const stepperBtn = (disabled: boolean): React.CSSProperties => ({
  width: 38,
  padding: "10px 0",
  border: "none",
  background: "white",
  color: disabled ? "var(--nw-border)" : "var(--nw-primary)",
  fontSize: 18,
  fontWeight: 700,
  lineHeight: 1,
  cursor: disabled ? "not-allowed" : "pointer",
  fontFamily: "inherit",
})

function Panel({ tone, children }: { tone: "brand" | "success" | "warn"; children: React.ReactNode }) {
  const styles: Record<typeof tone, { bg: string; border: string }> = {
    brand:   { bg: "rgba(124,99,200,0.06)", border: "rgba(124,99,200,0.22)" },
    success: { bg: "rgba(34,197,94,0.07)",  border: "rgba(34,197,94,0.28)" },
    warn:    { bg: "rgba(220,38,38,0.06)",  border: "rgba(220,38,38,0.25)" },
  }
  const t = styles[tone]
  return (
    <div style={{
      padding: "12px 14px", borderRadius: 10,
      background: t.bg, border: `1px solid ${t.border}`,
    }}>
      {children}
    </div>
  )
}

const panelTitle = (color: string): React.CSSProperties => ({
  margin: 0, fontSize: 13.5, fontWeight: 700, color,
})
const panelBody = (color: string): React.CSSProperties => ({
  margin: "4px 0 0", fontSize: 12.5, color, lineHeight: 1.55,
})

/* ────────────────────────────────────────────────────────────────── */
/* Identité                                                            */
/* ────────────────────────────────────────────────────────────────── */

/**
 * Vitrine read-only de l'identité de l'organisation : logo + nom +
 * slogan + email de contact + pastilles couleur(s). Tout est édité
 * depuis BrandingSection plus bas. Cette carte ne fait que présenter
 * l'identité telle qu'elle apparaîtra sur les CV anonymisés.
 */
function IdentitySection({
  organization, logoUrl,
}: {
  organization: {
    name: string
    brand_name: string | null
    brand_slogan: string | null
    brand_color: string | null
    brand_color_secondary: string | null
    contact_email: string | null
  }
  logoUrl: string | null
}) {
  const { lang } = useLanguage()
  const t = copy[lang]
  const displayName = (organization.brand_name?.trim() || organization.name?.trim()) || t.orgFallback
  const initials = displayName
    .split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase()
  const colors = [organization.brand_color, organization.brand_color_secondary].filter(Boolean) as string[]

  return (
    <Card
      title={t.orgIdentityTitle}
      subtitle={t.orgIdentitySubtitle}
    >
      <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
        <div style={{
          flexShrink: 0,
          width: 72, height: 72,
          borderRadius: 14,
          border: "1px solid var(--nw-primary-100)",
          background: "var(--nw-surface-muted)",
          display: "flex", alignItems: "center", justifyContent: "center",
          overflow: "hidden",
        }}>
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", padding: 6 }} />
          ) : (
            <span style={{ fontSize: 16, color: "var(--nw-primary-200)", fontWeight: 800, letterSpacing: "0.04em" }}>
              {initials}
            </span>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            margin: 0, fontSize: 17, fontWeight: 800, color: "var(--nw-text)",
            letterSpacing: "-0.01em",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {displayName}
          </p>
          {organization.brand_slogan ? (
            <p style={{
              margin: "3px 0 0", fontSize: 12.5, color: "var(--nw-text-muted)",
              fontStyle: "italic",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {organization.brand_slogan}
            </p>
          ) : (
            <p style={{ margin: "3px 0 0", fontSize: 12, color: "var(--nw-primary-200)" }}>
              {t.noSlogan}
            </p>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
            {/* Pastilles couleur(s) */}
            <div style={{ display: "flex", gap: 4 }}>
              {colors.length === 0 ? (
                <span style={{
                  display: "inline-block", width: 14, height: 14, borderRadius: 7,
                  background: "#000000", border: "1px solid rgba(0,0,0,0.10)",
                }} title={t.defaultColorTitle} />
              ) : (
                colors.map((c) => (
                  <span key={c} style={{
                    display: "inline-block", width: 14, height: 14, borderRadius: 7,
                    background: c, border: "1px solid rgba(0,0,0,0.10)",
                  }} title={c.toUpperCase()} />
                ))
              )}
            </div>
            <span style={{
              fontSize: 11.5, color: "var(--nw-text-muted)",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {organization.contact_email || <span style={{ color: "var(--nw-primary-200)" }}>{t.noContactEmail}</span>}
            </span>
          </div>
        </div>
      </div>
    </Card>
  )
}

/* ────────────────────────────────────────────────────────────────── */
/* Branding cabinet — logo + couleur + slogan                          */
/*                                                                     */
/* Ces 3 champs nourrissent le PDF anonymisé candidat : le client      */
/* final reçoit un document à l'identité visuelle du cabinet, pas      */
/* Naywa. Owner-only en édition, lecture seule pour les members.       */
/* ────────────────────────────────────────────────────────────────── */

interface BrandingRequestRow {
  id: string
  field: "name" | "brand_logo_path" | "contact_email"
  current_value: string | null
  requested_value: string
  status: "pending" | "approved" | "rejected" | "cancelled"
  decision_note: string | null
  decided_at: string | null
  created_at: string
  request_batch_id: string
}

function BrandingSection({
  organization, logoUrl, isOwner, onUpdated,
}: {
  organization: {
    id: string
    name: string
    brand_name: string | null
    brand_logo_path: string | null
    brand_color: string | null
    brand_color_secondary: string | null
    brand_slogan: string | null
    contact_email: string | null
    branding_locked_at: string | null
  }
  logoUrl: string | null
  isOwner: boolean
  onUpdated: () => Promise<void>
}) {
  const { lang } = useLanguage()
  const t = copy[lang]
  const sb = useMemo(() => getSupabase(), [])
  const [open, setOpen] = useState(true) // pliable, ouvert par défaut
  const [orgName, setOrgName] = useState(organization.brand_name ?? organization.name ?? "")
  const [slogan, setSlogan] = useState(organization.brand_slogan ?? "")
  const [email, setEmail] = useState(organization.contact_email ?? "")
  const [busy, setBusy] = useState<"idle" | "saving" | "uploading" | "deleting">("idle")
  const [error, setError] = useState<string | null>(null)
  // Boolean : la modale globale (multi-champs) est ouverte ou non.
  // L'owner coche dans la modale les champs qu'il veut modifier.
  const [requestModalOpen, setRequestModalOpen] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const emailValid = email.trim() === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  // Identité forte verrouillée si la grâce est passée. Couleurs + slogan
  // restent libres en permanence (faible enjeu de fraude).
  // useState + useEffect pour ne pas violer la règle de pureté du render
  // (Date.now() est non-déterministe et interdit pendant le render React 19).
  // L'horloge est essentiellement une "subscription à un système externe"
  // — on accepte le set-state-in-effect ici, c'est le pattern correct
  // pour exposer un timestamp dépendant de Date.now().
  const [brandingLocked, setBrandingLocked] = useState(false)
  useEffect(() => {
    // L'horloge (Date.now) est une "subscription à un système externe"
    // — on accepte le set-state-in-effect ici, c'est le pattern correct
    // pour exposer un timestamp dépendant de Date.now().
    const locked =
      !!organization.branding_locked_at &&
      new Date(organization.branding_locked_at).getTime() <= Date.now()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBrandingLocked(locked)
  }, [organization.branding_locked_at])

  // Statut des demandes en cours / récemment décidées. Affiché sous
  // chaque champ verrouillé pour que l'owner suive l'état de ses
  // soumissions sans aller chercher dans ses mails.
  const [requestsByField, setRequestsByField] =
    useState<Record<"name" | "brand_logo_path" | "contact_email", BrandingRequestRow | null>>({
      name: null, brand_logo_path: null, contact_email: null,
    })
  // refreshTick : utilisé par les flows post-soumission pour redéclencher
  // l'effet de fetch sans définir un useCallback (qui plante la règle
  // react-hooks/set-state-in-effect).
  const [requestsRefreshTick, setRequestsRefreshTick] = useState(0)
  useEffect(() => {
    if (!isOwner) return
    let cancelled = false
    void (async () => {
      try {
        const r = await fetch("/api/cabinet/branding/requests", { cache: "no-store" })
        if (!r.ok || cancelled) return
        const j = await r.json() as { requests: BrandingRequestRow[] }
        // On garde la plus récente par champ — c'est celle qui reflète
        // le statut courant aux yeux de l'owner (les anciennes sont des
        // demandes annulées/refusées déjà notifiées par mail).
        const latest: Record<"name" | "brand_logo_path" | "contact_email", BrandingRequestRow | null> = {
          name: null, brand_logo_path: null, contact_email: null,
        }
        for (const req of j.requests ?? []) {
          if (!latest[req.field]) latest[req.field] = req
        }
        if (cancelled) return
        setRequestsByField(latest)
      } catch {
        /* silencieux : pas de statut si l'API tombe, l'UI reste utilisable */
      }
    })()
    return () => { cancelled = true }
  }, [isOwner, requestsRefreshTick])

  const patch = async (body: Record<string, unknown>, kind: "saving" | "uploading" | "deleting" = "saving") => {
    setBusy(kind); setError(null)
    const res = await fetch("/api/cabinet", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({} as { error?: string }))
      setError(j.error ?? t.saveError)
    } else {
      await onUpdated()
    }
    setBusy("idle")
  }

  const uploadLogo = async (file: File) => {
    if (!isOwner) return
    setBusy("uploading"); setError(null)
    const ext = file.name.split(".").pop() || "png"
    const path = `${organization.id}/${Date.now()}.${ext}`
    const { error: upErr } = await sb.storage.from("brand-logos").upload(path, file, { upsert: true })
    if (upErr) { setError(upErr.message); setBusy("idle"); return }
    await patch({ brand_logo_path: path }, "uploading")
  }

  const removeLogo = async () => {
    if (!isOwner) return
    if (organization.brand_logo_path) {
      await sb.storage.from("brand-logos").remove([organization.brand_logo_path])
    }
    await patch({ brand_logo_path: null }, "deleting")
  }

  const saveEmail = async () => {
    if (!isOwner) return
    const next = email.trim() || null
    if ((organization.contact_email ?? null) === next) return
    if (!emailValid) return
    await patch({ contact_email: next })
  }

  const saveName = async () => {
    if (!isOwner) return
    const next = orgName.trim()
    if (!next) return
    const currentName = (organization.brand_name ?? organization.name ?? "").trim()
    if (currentName === next) return
    await patch({ name: next, brand_name: next })
  }

  // Résumé visible quand la carte est repliée — pastilles + label
  const summary = (() => {
    const parts: string[] = []
    if (logoUrl) parts.push(t.summaryLogo)
    if (organization.brand_color) parts.push(t.summaryColor)
    if (organization.brand_color_secondary) parts.push(t.summaryBicolor)
    if (organization.brand_slogan) parts.push(t.summarySlogan)
    if (organization.contact_email) parts.push(t.summaryContact)
    return parts.length > 0 ? parts.join(" · ") : t.summaryToConfigure
  })()

  return (
    <Card
      title={t.branding}
      subtitle={t.brandingSubtitle}
      // Header : bouton 'Modifier vos informations verrouillées' visible
      // uniquement quand l'identité forte est verrouillée + bouton repli.
      headerRight={
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          {brandingLocked && isOwner && (
            <button
              type="button"
              onClick={() => setRequestModalOpen(true)}
              style={{
                fontSize: 11.5, fontWeight: 700, color: "var(--nw-primary)",
                background: "white",
                border: "1px solid rgba(124,99,200,0.30)",
                padding: "6px 11px", borderRadius: 8,
                cursor: "pointer", fontFamily: "inherit",
                display: "inline-flex", alignItems: "center", gap: 6,
                whiteSpace: "nowrap",
              }}
              title={t.requestChangeTitle}
            >
              <LockIcon size={11} />
              {t.editLockedInfo}
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            style={{
              fontSize: 12, fontWeight: 700, color: "var(--nw-primary)",
              background: "transparent", border: "none",
              padding: "4px 8px", cursor: "pointer", fontFamily: "inherit",
              display: "inline-flex", alignItems: "center", gap: 4,
            }}
          >
            {open ? t.collapse : t.expand}
          </button>
        </div>
      }
    >
      {!open && (
        <p style={{ margin: 0, fontSize: 12.5, color: "var(--nw-text-muted)" }}>
          <span style={{ color: organization.brand_color || "#000000", marginRight: 6, fontWeight: 700 }}>●</span>
          {summary}
        </p>
      )}

      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          {/* Nom de l'organisation */}
          <div>
            <Label>{t.orgNameLabel}</Label>
            {brandingLocked ? (
              <>
                <LockedField value={orgName || t.undefined_} />
                <RequestStatusInline request={requestsByField.name} />
              </>
            ) : (
              <>
                <input
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  onBlur={saveName}
                  placeholder={t.orgNamePlaceholder}
                  disabled={!isOwner || busy === "saving"}
                  style={inputStyle}
                />
                <Hint>{busy === "saving" ? t.saving : t.autoSave}</Hint>
              </>
            )}
          </div>

          {/* Logo */}
          <div>
            <Label>{t.logoLabel}</Label>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{
                width: 64, height: 64,
                borderRadius: 12, border: "1.5px dashed var(--nw-primary-100)",
                background: "var(--nw-surface-muted)",
                display: "flex", alignItems: "center", justifyContent: "center",
                overflow: "hidden",
                flexShrink: 0,
              }}>
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", padding: 6 }} />
                ) : (
                  <span style={{ fontSize: 10, color: "var(--nw-text-muted)" }}>{t.none}</span>
                )}
              </div>
              {brandingLocked ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
                  <LockedBadge />
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <button type="button" onClick={() => fileInput.current?.click()}
                    disabled={!isOwner || busy !== "idle"}
                    style={smallBtnPrimary}>
                    {busy === "uploading" ? "…" : logoUrl ? t.replaceLogo : t.uploadLogo}
                  </button>
                  {logoUrl && isOwner && (
                    <button type="button" onClick={removeLogo} disabled={busy !== "idle"} style={smallBtnGhost}>
                      {t.removeLogo}
                    </button>
                  )}
                </div>
              )}
            </div>
            <input ref={fileInput} type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) { void uploadLogo(f); e.target.value = "" }
              }}
            />
            {brandingLocked && <RequestStatusInline request={requestsByField.brand_logo_path} />}
          </div>

          {/* Couleurs — picker complet avec palette + extraction logo + bicolore */}
          <div>
            <Label>{t.brandColorsLabel}</Label>
            <Hint>
              {t.brandColorsHint}
            </Hint>
            <div style={{ marginTop: 10 }}>
              <BrandColorPicker
                primary={organization.brand_color}
                secondary={organization.brand_color_secondary}
                isOwner={isOwner}
                logoUrl={logoUrl}
                saving={busy === "saving"}
                onSave={(body) => patch(body)}
              />
            </div>
          </div>

          {/* Slogan */}
          <div>
            <Label>{t.sloganLabel} <span style={{ color: "var(--nw-text-muted)", fontWeight: 400 }}>{t.optionalTag}</span></Label>
            <input
              value={slogan}
              onChange={(e) => setSlogan(e.target.value.slice(0, 120))}
              onBlur={() => {
                if (!isOwner) return
                const next = slogan.trim() || null
                if ((organization.brand_slogan ?? null) === next) return
                void patch({ brand_slogan: next })
              }}
              placeholder={t.sloganPlaceholder}
              disabled={!isOwner || busy === "saving"}
              maxLength={120}
              style={inputStyle}
            />
            <Hint>{t.charsCount(slogan.length)}</Hint>
          </div>

          {/* Email de contact */}
          <div>
            <Label>{t.contactEmailLabel}</Label>
            {brandingLocked ? (
              <>
                <LockedField value={email || t.undefined_} />
                <RequestStatusInline request={requestsByField.contact_email} />
              </>
            ) : (
              <>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={saveEmail}
                  placeholder={t.contactEmailPlaceholder}
                  disabled={!isOwner || busy === "saving"}
                  style={{
                    ...inputStyle,
                    borderColor: email && !emailValid ? "#EF4444" : inputStyle.borderColor,
                  }}
                />
                <Hint>
                  {email && !emailValid
                    ? t.invalidEmailFormat
                    : t.contactEmailHint}
                </Hint>
              </>
            )}
          </div>

          {requestModalOpen && (
            <BrandingChangeRequestModal
              organizationId={organization.id}
              currentName={orgName}
              currentLogoPath={organization.brand_logo_path}
              currentLogoUrl={logoUrl}
              currentEmail={email}
              onClose={() => setRequestModalOpen(false)}
              onSubmitted={() => {
                setRequestModalOpen(false)
                void onUpdated()
                setRequestsRefreshTick((t) => t + 1)
              }}
            />
          )}

          {error && <p style={{ margin: "4px 0 0", fontSize: 12.5, color: "#EF4444" }}>{error}</p>}
        </div>
      )}
    </Card>
  )
}

/* ────────────────────────────────────────────────────────────────── */
/* Champs branding verrouillés post-onboarding                         */
/* ────────────────────────────────────────────────────────────────── */

function LockedField({ value }: { value: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "9px 11px",
      borderRadius: 8,
      background: "var(--nw-surface-muted)",
      border: "1.5px solid var(--nw-border)",
    }}>
      <LockIcon />
      <span style={{
        flex: 1, minWidth: 0,
        fontSize: 13.5, color: "var(--nw-text-body)", fontWeight: 500,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {value}
      </span>
    </div>
  )
}

/**
 * Statut d'une demande affiché sous un champ verrouillé pour que
 * l'owner suive l'état de sa soumission sans aller chercher dans
 * ses mails (pending / approved récent / rejected avec raison).
 *
 * Les demandes "cancelled" (annulées par l'owner lui-même en re-
 * soumettant une nouvelle demande sur le même champ) ne sont pas
 * affichées : silence utile.
 */
function RequestStatusInline({ request }: { request: BrandingRequestRow | null }) {
  const { lang } = useLanguage()
  const t = copy[lang]
  if (!request) return null
  if (request.status === "cancelled") return null

  const dateLabel = (iso: string | null) => iso
    ? new Date(iso).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", { day: "numeric", month: "long", year: "numeric" })
    : ""

  if (request.status === "pending") {
    return (
      <div style={{
        marginTop: 8, padding: "8px 11px",
        background: "rgba(245,158,11,0.06)",
        border: "1px solid rgba(245,158,11,0.25)",
        borderRadius: 8,
        display: "flex", alignItems: "center", gap: 9,
      }}>
        <DotIndicator color="var(--nw-warn)" />
        <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: "var(--nw-warn-strong)", lineHeight: 1.5 }}>
          <strong>{t.requestPending}</strong>{" "}
          {t.requestPendingBody(dateLabel(request.created_at))}
        </span>
      </div>
    )
  }

  if (request.status === "approved") {
    return (
      <div style={{
        marginTop: 8, padding: "8px 11px",
        background: "rgba(34,197,94,0.06)",
        border: "1px solid rgba(34,197,94,0.25)",
        borderRadius: 8,
        display: "flex", alignItems: "center", gap: 9,
      }}>
        <DotIndicator color="var(--nw-success)" />
        <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: "#166534", lineHeight: 1.5 }}>
          <strong>{t.requestApproved}</strong>
          {request.decided_at ? t.onThe(dateLabel(request.decided_at)) : ""}.
        </span>
      </div>
    )
  }

  // rejected
  return (
    <div style={{
      marginTop: 8, padding: "9px 12px",
      background: "rgba(220,38,38,0.05)",
      border: "1px solid rgba(220,38,38,0.25)",
      borderRadius: 8,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: request.decision_note ? 4 : 0 }}>
        <DotIndicator color="var(--nw-danger-strong)" />
        <span style={{ flex: 1, fontSize: 12, color: "#991B1B", lineHeight: 1.5 }}>
          <strong>{t.requestRejected}</strong>
          {request.decided_at ? t.onThe(dateLabel(request.decided_at)) : ""}.
        </span>
      </div>
      {request.decision_note && (
        <p style={{
          margin: "0 0 0 18px",
          fontSize: 12, color: "#991B1B",
          lineHeight: 1.55, fontStyle: "italic",
        }}>
          {lang === "fr" ? `« ${request.decision_note} »` : `"${request.decision_note}"`}
        </p>
      )}
    </div>
  )
}

function DotIndicator({ color }: { color: string }) {
  return (
    <span aria-hidden style={{
      width: 9, height: 9, borderRadius: "50%",
      background: color, flexShrink: 0,
      boxShadow: `0 0 0 3px ${color}1A`,
    }} />
  )
}

function LockedBadge() {
  const { lang } = useLanguage()
  const t = copy[lang]
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      fontSize: 10.5, fontWeight: 700, color: "var(--nw-text-muted)",
      background: "var(--nw-neutral-100)", border: "1px solid var(--nw-border)",
      padding: "3px 7px", borderRadius: 100,
      letterSpacing: "0.05em", fontFamily: "var(--nw-font-mono)", textTransform: "uppercase",
    }}>
      <LockIcon size={10} />
      {t.locked}
    </span>
  )
}

function LockIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 018 0v3" />
    </svg>
  )
}

function ShieldIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="var(--nw-primary)" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden
      style={{ flexShrink: 0, marginTop: 1 }}>
      <path d="M12 3l8 3v6c0 4.5-3.4 8.5-8 9-4.6-.5-8-4.5-8-9V6l8-3z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  )
}

/**
 * Modale globale "Demande de modification" — multi-champs.
 *
 * L'owner coche les champs qu'il veut modifier (nom, logo, email
 * contact) parmi les 3 verrouillés. Pour chaque coché, un sous-form
 * apparaît pour saisir la nouvelle valeur. Une seule `reason` couvre
 * toute la demande.
 *
 * Tout est soumis en une fois → 1 batch côté DB (1 row par champ).
 * Côté /admin/demandes, le batch s'affiche groupé mais chaque champ
 * reste décidable indépendamment (j'accepte le nom, je refuse le
 * logo).
 */
function BrandingChangeRequestModal({
  organizationId, currentName, currentLogoPath, currentLogoUrl, currentEmail, onClose, onSubmitted,
}: {
  /** Org du caller — sert à respecter la RLS Storage brand-logos qui
   *  exige `{org_id}/...` comme premier segment du path. */
  organizationId: string
  currentName: string
  currentLogoPath: string | null
  currentLogoUrl: string | null
  currentEmail: string
  onClose: () => void
  onSubmitted: () => void
}) {
  useEscapeKey(onClose)
  const { lang } = useLanguage()
  const t = copy[lang]
  const sb = useMemo(() => getSupabase(), [])
  // Cases cochées par l'owner.
  const [editName, setEditName] = useState(false)
  const [editLogo, setEditLogo] = useState(false)
  const [editEmail, setEditEmail] = useState(false)
  // Valeurs saisies.
  const [newName, setNewName] = useState("")
  const [newEmail, setNewEmail] = useState("")
  const [uploadedLogoPath, setUploadedLogoPath] = useState<string | null>(null)
  const [uploadedLogoLocalUrl, setUploadedLogoLocalUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const emailValid = newEmail === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim())

  const handleLogoPick = async (file: File) => {
    setUploading(true); setError(null)
    try {
      // Path = `{org_id}/pending/{ts}.ext`. La RLS Storage du bucket
      // brand-logos (migration 025) exige `{current_org_id()}` comme
      // 1er segment — un path racine "pending/..." est refusé. Le
      // sous-folder "pending" distingue ces fichiers en cours de
      // validation des logos déjà approuvés (`{org_id}/{ts}.ext`).
      const ext = file.name.split(".").pop() || "png"
      const path = `${organizationId}/pending/${Date.now()}.${ext}`
      const { error: upErr } = await sb.storage.from("brand-logos").upload(path, file, { upsert: true })
      if (upErr) throw new Error(upErr.message)
      setUploadedLogoPath(path)
      // Aperçu local instantané (avant que la signed URL existe).
      setUploadedLogoLocalUrl(URL.createObjectURL(file))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setUploading(false)
    }
  }

  const canSubmit = (() => {
    if (uploading) return false
    if (editName && !newName.trim()) return false
    if (editLogo && !uploadedLogoPath) return false
    if (editEmail && (!newEmail.trim() || !emailValid)) return false
    return editName || editLogo || editEmail
  })()

  const submit = async () => {
    if (!canSubmit) return
    setBusy(true); setError(null)
    try {
      const changes: Array<{ field: string; requested_value: string }> = []
      if (editName) changes.push({ field: "name", requested_value: newName.trim() })
      if (editLogo && uploadedLogoPath) changes.push({ field: "brand_logo_path", requested_value: uploadedLogoPath })
      if (editEmail) changes.push({ field: "contact_email", requested_value: newEmail.trim() })
      const r = await fetch("/api/cabinet/branding/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changes, reason: reason.trim() || null }),
      })
      if (!r.ok) {
        const j = await r.json().catch(() => ({} as { error?: string }))
        throw new Error(j.error ?? t.errorWithStatus(r.status))
      }
      onSubmitted()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(17,24,39,0.40)", backdropFilter: "blur(2px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
        overflowY: "auto",
      }}
    >
      <m.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: EASE }}
        style={{
          width: "100%", maxWidth: 560,
          maxHeight: "calc(100vh - 48px)",
          overflowY: "auto",
          background: "white", borderRadius: 16, padding: 24,
          fontFamily: "var(--font-inter), sans-serif",
          boxShadow: "0 24px 64px -24px rgba(17,24,39,0.30)",
          margin: "auto",
        }}
      >
        <header style={{ marginBottom: 16 }}>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "var(--nw-primary)", letterSpacing: "0.10em", fontFamily: "var(--nw-font-mono)", textTransform: "uppercase" }}>
            {t.changeRequestEyebrow}
          </p>
          <h2 style={{ margin: "4px 0 0", fontSize: 20, fontWeight: 800, color: "var(--nw-text)", letterSpacing: "-0.01em" }}>
            {t.changeRequestTitle}
          </h2>
          <p style={{ margin: "10px 0 0", fontSize: 13, color: "var(--nw-text-muted)", lineHeight: 1.55 }}>
            {t.changeRequestBody}
          </p>
          <div style={{
            margin: "12px 0 0",
            padding: "10px 12px",
            background: "rgba(124,99,200,0.05)",
            border: "1px solid rgba(124,99,200,0.18)",
            borderRadius: 8,
            display: "flex", gap: 9, alignItems: "flex-start",
          }}>
            <ShieldIcon />
            <p style={{ margin: 0, fontSize: 11.5, color: "var(--nw-text-secondary)", lineHeight: 1.5 }}>
              <strong style={{ color: "var(--nw-text-body)" }}>{t.whyThisStep}</strong>{" "}
              {t.whyThisStepBody}
            </p>
          </div>
        </header>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Nom */}
          <ChangeBlock
            checked={editName}
            onToggle={() => setEditName((v) => !v)}
            title={t.orgNameLabel}
            currentSummary={currentName || t.undefined_}
          >
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t.orgNamePlaceholder}
              maxLength={200}
              autoFocus
              style={inputStyle}
            />
          </ChangeBlock>

          {/* Logo */}
          <ChangeBlock
            checked={editLogo}
            onToggle={() => setEditLogo((v) => !v)}
            title={t.logoField}
            currentSummary={currentLogoPath ? t.currentLogo : t.noLogo}
          >
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              {/* Logo actuel */}
              <div style={{ flex: 1 }}>
                <p style={miniLabel}>{t.current}</p>
                <LogoFrame src={currentLogoUrl} placeholder={t.none} />
              </div>
              {/* Logo demandé */}
              <div style={{ flex: 1 }}>
                <p style={miniLabel}>{t.new_}</p>
                <LogoFrame src={uploadedLogoLocalUrl} placeholder={t.toChoose} highlight />
              </div>
            </div>
            <div style={{ marginTop: 10 }}>
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                disabled={uploading}
                style={smallBtnPrimary}
              >
                {uploading ? t.uploading : uploadedLogoPath ? t.replaceFile : t.chooseFile}
              </button>
              <input
                ref={fileInput}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) { void handleLogoPick(f); e.target.value = "" }
                }}
              />
            </div>
          </ChangeBlock>

          {/* Email */}
          <ChangeBlock
            checked={editEmail}
            onToggle={() => setEditEmail((v) => !v)}
            title={t.contactEmailLabel}
            currentSummary={currentEmail || t.undefined_}
          >
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder={t.contactEmailPlaceholder}
              maxLength={200}
              style={{
                ...inputStyle,
                borderColor: newEmail && !emailValid ? "#EF4444" : inputStyle.borderColor,
              }}
            />
            {newEmail && !emailValid && (
              <p style={{ margin: "5px 0 0", fontSize: 11.5, color: "#EF4444" }}>
                {t.invalidEmailFormat}
              </p>
            )}
          </ChangeBlock>

          <div>
            <Label>
              {t.reasonLabel}{" "}
              <span style={{ color: "var(--nw-text-muted)", fontWeight: 400 }}>{t.optionalTag}</span>
            </Label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t.reasonPlaceholder}
              maxLength={500}
              rows={3}
              style={{
                ...inputStyle, resize: "vertical", minHeight: 70,
                fontFamily: "var(--font-inter), sans-serif",
              }}
            />
          </div>

          {error && (
            <p style={{ margin: 0, fontSize: 12.5, color: "var(--nw-danger-strong)" }}>{error}</p>
          )}

          {!editName && !editLogo && !editEmail && (
            <p style={{ margin: 0, fontSize: 12.5, color: "var(--nw-text-muted)", fontStyle: "italic" }}>
              {t.checkAtLeastOne}
            </p>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
          <button type="button" onClick={onClose} disabled={busy} style={smallBtnGhost}>
            {t.cancel}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy || !canSubmit}
            style={{
              padding: "10px 16px", borderRadius: 10,
              border: "none", color: "white",
              background: busy || !canSubmit
                ? "var(--nw-primary-200)"
                : "linear-gradient(120deg, var(--nw-primary) 0%, var(--nw-primary-dark) 100%)",
              fontSize: 13, fontWeight: 700,
              cursor: busy || !canSubmit ? "not-allowed" : "pointer",
              fontFamily: "inherit",
            }}
          >
            {busy ? t.sendingRequest : t.sendRequest}
          </button>
        </div>
      </m.div>
    </div>
  )
}

/**
 * Bloc accordeon dans la modale : checkbox + titre + résumé valeur
 * actuelle. Une fois coché, on déplie le sous-formulaire (children).
 */
function ChangeBlock({
  checked, onToggle, title, currentSummary, children,
}: {
  checked: boolean
  onToggle: () => void
  title: string
  currentSummary: string
  children: React.ReactNode
}) {
  const { lang } = useLanguage()
  const t = copy[lang]
  return (
    <div style={{
      borderRadius: 12,
      border: checked ? "1.5px solid rgba(124,99,200,0.30)" : "1px solid var(--nw-border-soft)",
      background: checked ? "rgba(124,99,200,0.03)" : "white",
      padding: 12,
    }}>
      <label style={{
        display: "flex", alignItems: "flex-start", gap: 10,
        cursor: "pointer",
      }}>
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          style={{
            marginTop: 3, accentColor: "var(--nw-primary)",
            width: 16, height: 16, cursor: "pointer",
          }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            margin: 0, fontSize: 13.5, fontWeight: 700,
            color: "var(--nw-text)", letterSpacing: "-0.005em",
          }}>
            {title}
          </p>
          <p style={{
            margin: "2px 0 0", fontSize: 12, color: "var(--nw-text-muted)",
            fontStyle: "italic",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {t.currentPrefix(currentSummary)}
          </p>
        </div>
      </label>
      {checked && (
        <div style={{ marginTop: 12, paddingLeft: 26 }}>
          {children}
        </div>
      )}
    </div>
  )
}

function LogoFrame({ src, placeholder, highlight }: { src: string | null | undefined; placeholder: string; highlight?: boolean }) {
  return (
    <div style={{
      width: "100%", aspectRatio: "2 / 1",
      borderRadius: 8,
      border: highlight ? "1px solid rgba(124,99,200,0.30)" : "1px solid var(--nw-border-soft)",
      background: "var(--nw-surface-muted)",
      display: "flex", alignItems: "center", justifyContent: "center",
      overflow: "hidden",
    }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", padding: 6 }} />
      ) : (
        <span style={{ fontSize: 11.5, color: "var(--nw-text-muted)", fontStyle: "italic" }}>{placeholder}</span>
      )}
    </div>
  )
}

const miniLabel: React.CSSProperties = {
  margin: "0 0 4px",
  fontSize: 10.5, fontWeight: 700,
  color: "var(--nw-text-muted)", letterSpacing: "0.05em", fontFamily: "var(--nw-font-mono)", textTransform: "uppercase",
}

/**
 * Carte standalone pliable "Politique pricing" — vit dans la grille
 * /organisation à côté de Branding/Identité. Repliée par défaut pour
 * ne pas alourdir la page (le contenu n'est qu'un CTA "Configurer").
 */
function PricingPolicySectionCollapsible() {
  const { lang } = useLanguage()
  const t = copy[lang]
  const [open, setOpen] = useState(false)
  return (
    <Card
      title={t.pricingPolicyTitle}
      subtitle={t.pricingPolicySubtitle}
      headerRight={
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          style={{
            fontSize: 12, fontWeight: 700, color: "var(--nw-primary)",
            background: "transparent", border: "none",
            padding: "4px 8px", cursor: "pointer", fontFamily: "inherit",
          }}
        >
          {open ? t.collapse : t.expand}
        </button>
      }
    >
      {!open ? (
        <p style={{ margin: 0, fontSize: 12.5, color: "var(--nw-text-muted)" }}>
          {t.pricingPolicyReused}
        </p>
      ) : (
        <div style={{
          padding: "12px 14px", borderRadius: 10,
          background: "rgba(124,99,200,0.06)", border: "1px solid rgba(124,99,200,0.20)",
          display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
          flexWrap: "wrap",
        }}>
          <div>
            <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: "var(--nw-text)" }}>
              {t.marginsBenefitsLocations}
            </p>
            <p style={{ margin: "3px 0 0", fontSize: 12.5, color: "var(--nw-text-muted)" }}>
              {t.configureDetails}
            </p>
          </div>
          <a
            href="/organisation/parametrage"
            style={{
              padding: "8px 13px", borderRadius: 8,
              background: "var(--nw-primary)", color: "white",
              fontSize: 12, fontWeight: 700,
              textDecoration: "none", whiteSpace: "nowrap",
            }}
          >
            {t.configureArrow}
          </a>
        </div>
      )}
    </Card>
  )
}

/* ────────────────────────────────────────────────────────────────── */
/* Preview tools — visible UNIQUEMENT sur déploiements preview Vercel  */
/*                                                                     */
/* Permet à Elyas de re-déclencher des flows (onboarding, etc.) à      */
/* volonté pour tester les modifs avant merge. Inactif sur la prod     */
/* (le composant se retire tout seul si hostname != *.vercel.app).     */
/* ────────────────────────────────────────────────────────────────── */

function PreviewToolsCard() {
  const router = useRouter()
  const [isPreview, setIsPreview] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Détection côté client : on n'affiche le composant que sur un
    // sous-domaine Vercel preview. Sur naywastudio.com il reste null.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsPreview(window.location.hostname.endsWith(".vercel.app"))
  }, [])

  if (!isPreview) return null

  const resetOnboarding = async () => {
    if (busy) return
    if (!window.confirm("Recommencer l'onboarding ? Aucune donnée vivier/missions ne sera supprimée.")) return
    setBusy(true); setError(null)
    const res = await fetch("/api/cabinet/reset-onboarding", { method: "POST" })
    if (!res.ok) {
      const j = await res.json().catch(() => ({} as { error?: string }))
      setError(j.error ?? "Erreur lors de la réinitialisation.")
      setBusy(false)
      return
    }
    // Le proxy va re-rediriger vers /onboarding au prochain hit
    // /organisation. router.push direct sur /onboarding pour le confort.
    router.push("/onboarding")
  }

  return (
    <div style={{
      background: "linear-gradient(165deg, #FEF3C7 0%, #FDE68A 100%)",
      border: "1px solid #F59E0B",
      borderRadius: 14,
      padding: "16px 18px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 16,
      flexWrap: "wrap",
    }}>
      <div style={{ flex: 1, minWidth: 240 }}>
        <p style={{
          margin: "0 0 4px",
          fontSize: 11,
          fontWeight: 700,
          color: "var(--nw-warn-strong)",
          letterSpacing: "0.08em",
          fontFamily: "var(--nw-font-mono)", textTransform: "uppercase",
        }}>
          Outils de preview
        </p>
        <p style={{
          margin: 0,
          fontSize: 13,
          color: "#78350F",
          lineHeight: 1.55,
        }}>
          Réservé aux déploiements preview Vercel. Recommencer
          l&apos;onboarding remet <code>cabinet_onboarded_at</code> à
          NULL — aucune donnée n&apos;est supprimée.
        </p>
        {error && (
          <p style={{ margin: "8px 0 0", fontSize: 12.5, color: "var(--nw-danger-strong)", fontWeight: 600 }}>
            {error}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={resetOnboarding}
        disabled={busy}
        style={{
          padding: "10px 16px",
          borderRadius: 10,
          border: "1px solid var(--nw-warn-strong)",
          background: "var(--nw-warn-strong)",
          color: "#FEF3C7",
          fontSize: 13,
          fontWeight: 700,
          cursor: busy ? "wait" : "pointer",
          fontFamily: "inherit",
          letterSpacing: "0.01em",
          whiteSpace: "nowrap",
        }}
      >
        {busy ? "Réinitialisation…" : "Recommencer l'onboarding"}
      </button>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────── */
/* Membres + invitations                                               */
/* ────────────────────────────────────────────────────────────────── */

function MembersSection({
  members, invites, seatsBudget, currentUserId, userEmail, isOwner, onChange,
}: {
  members: MemberRow[]
  invites: PendingInvite[]
  /** Nombre total de sièges payés (sub Stripe) ou alloués (legacy). */
  seatsBudget: number
  currentUserId: string
  userEmail: string
  isOwner: boolean
  onChange: () => void
}) {
  const { lang } = useLanguage()
  const t = copy[lang]
  // Index du siège vide actuellement "ouvert" (en mode saisie email).
  // -1 = aucun siège en édition.
  const [editingSlot, setEditingSlot] = useState<number>(-1)
  const [inviteEmail, setInviteEmail] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [okMessage, setOkMessage] = useState<string | null>(null)

  // Seats used = uniquement les membres ALLOUÉS + invitations en
  // attente. Owner sans siège alloué = pas comptabilisé.
  const seatsUsed = members.filter((m) => m.has_sourcing_seat).length + invites.length
  // Members sans siège alloué : peuvent être listés dans le menu
  // "+ Allouer un membre existant" sur les sièges vides.
  const unallocatedMembers = members.filter((m) => !m.has_sourcing_seat)
  // On affiche au moins `seatsBudget`, et plus si pour une raison
  // historique l'organisation a déjà plus de monde alloué que de sièges
  // payés (cas peu courant mais qu'on ne veut pas cacher).
  const seatsTotal = Math.max(seatsBudget, seatsUsed, 1)

  const sendInvite = async () => {
    const trimmed = inviteEmail.trim().toLowerCase()
    if (!trimmed || !trimmed.includes("@")) {
      setError(t.invalidEmail); return
    }
    setBusy(true); setError(null); setOkMessage(null)
    const res = await fetch("/api/cabinet/invite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: trimmed }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({} as { error?: string }))
      setError(j.error ?? t.inviteSendError)
    } else {
      setInviteEmail("")
      setEditingSlot(-1)
      setOkMessage(t.inviteSentTo(trimmed))
      onChange()
    }
    setBusy(false)
  }

  const revokeInvite = async (id: string) => {
    setBusy(true); setError(null); setOkMessage(null)
    const res = await fetch(`/api/cabinet/invite?id=${encodeURIComponent(id)}`, { method: "DELETE" })
    if (!res.ok) {
      const j = await res.json().catch(() => ({} as { error?: string }))
      setError(j.error ?? t.revokeError)
    } else {
      onChange()
    }
    setBusy(false)
  }

  // removeMember conservé pour les workflows admin futurs (retrait
  // total d'un membre, pas juste libération de siège). Pour l'instant
  // l'UI passe par deallocateMember : libérer un siège ne supprime pas
  // le profil. Le retrait full restera dispo via le bouton "Retirer
  // de l'organisation" sur la fiche membre individuelle si on l'ajoute
  // un jour.
  void (async (userId: string, label: string) => {
    if (!confirm(t.removeConfirm(label))) return
    await fetch(`/api/cabinet/members/${encodeURIComponent(userId)}`, { method: "DELETE" })
    onChange()
  })

  // Construction de la liste des sièges :
  //   1. Membres ALLOUÉS (owner alloué first), peu importe leur rôle
  //   2. Invitations en attente
  //   3. Sièges vides jusqu'au budget
  // Les membres sans siège alloué (typiquement l'owner par défaut) ne
  // sont PAS rendus comme occupant un siège — ils apparaissent dans
  // la liste de sélection "Allouer un membre existant" sur les sièges
  // vides.
  type Slot =
    | { kind: "member"; member: MemberRow }
    | { kind: "invite"; invite: PendingInvite }
    | { kind: "empty"; index: number }

  const allocatedMembers = members.filter((m) => m.has_sourcing_seat)
  const orderedAllocated: MemberRow[] = [
    ...allocatedMembers.filter((m) => m.role === "owner"),
    ...allocatedMembers.filter((m) => m.role !== "owner"),
  ]
  const slots: Slot[] = [
    ...orderedAllocated.map((m): Slot => ({ kind: "member", member: m })),
    ...invites.map((inv): Slot => ({ kind: "invite", invite: inv })),
  ]
  for (let i = slots.length; i < seatsTotal; i++) {
    slots.push({ kind: "empty", index: i })
  }

  /** Alloue un siège à un membre existant (owner ou member sans siège).
   *  Endpoint partagé avec le toggle self-seat owner. */
  const allocateExistingMember = async (userId: string) => {
    setBusy(true); setError(null); setOkMessage(null)
    const res = await fetch("/api/cabinet/seat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, allocate: true }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({} as { error?: string }))
      setError(j.error ?? t.allocateError)
    } else {
      onChange()
    }
    setBusy(false)
  }

  /** Délègue (ou retire) à un membre le droit de gérer le branding et la
   *  politique de pricing. Volontairement SÉPARÉ du siège : un siège donne
   *  accès au workspace, la délégation donne accès à la configuration —
   *  deux choses différentes qu'on ne doit pas confondre. */
  const toggleDelegate = async (userId: string, allow: boolean, label: string) => {
    if (allow && !confirm(t.delegateConfirm(label))) return
    setBusy(true); setError(null); setOkMessage(null)
    const res = await fetch("/api/cabinet/delegate-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, allow }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({} as { message?: string; error?: string }))
      setError(j.message ?? j.error ?? t.delegateError)
    } else {
      setOkMessage(allow ? t.delegateOn(label) : t.delegateOff(label))
      onChange()
    }
    setBusy(false)
  }

  /** Désalloue un siège (owner peut désallouer n'importe qui ; un member
   *  peut désallouer son propre siège). */
  const deallocateMember = async (userId: string, label: string) => {
    if (!confirm(t.deallocateConfirm(label))) return
    setBusy(true); setError(null); setOkMessage(null)
    const res = await fetch("/api/cabinet/seat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, allocate: false }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({} as { error?: string }))
      setError(j.error ?? t.deallocateError)
    } else {
      setOkMessage(t.seatReleased(label))
      onChange()
    }
    setBusy(false)
  }

  return (
    <Card title={t.members} subtitle={t.seatsSubtitle(seatsUsed, seatsTotal)}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 280, overflow: "auto" }}>
        {slots.map((slot, idx) => {
          if (slot.kind === "member") {
            const m = slot.member
            const canDeallocate = isOwner
            return (
              <div key={`m-${m.user_id}`} style={memberRowStyle}>
                <Avatar letter={(m.first_name?.[0] ?? "?").toUpperCase()} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={memberNameStyle}>
                    {m.first_name ?? t.noFirstName}
                    {m.user_id === currentUserId && (
                      <span style={{ color: "var(--nw-text-muted)", fontWeight: 500 }}>{t.youSuffix}</span>
                    )}
                  </p>
                  {m.user_id === currentUserId && (
                    <p style={memberSubStyle}>{userEmail}</p>
                  )}
                </div>
                <RolePill role={m.role} />
                {isOwner && m.role !== "owner" && (
                  <button
                    type="button"
                    onClick={() => void toggleDelegate(
                      m.user_id,
                      !m.can_manage_org_settings,
                      m.first_name ?? t.noFirstName,
                    )}
                    disabled={busy}
                    title={m.can_manage_org_settings ? t.delegateRemoveHint : t.delegateAddHint}
                    style={{
                      ...iconBtnStyle,
                      ...(m.can_manage_org_settings
                        ? {
                            color: "var(--nw-primary)",
                            borderColor: "var(--nw-primary-200)",
                            background: "var(--nw-primary-50)",
                          }
                        : null),
                    }}
                  >
                    {m.can_manage_org_settings ? t.delegateOnLabel : t.delegateOffLabel}
                  </button>
                )}
                {canDeallocate && (
                  <button
                    type="button"
                    onClick={() => void deallocateMember(m.user_id, m.first_name ?? t.noFirstName)}
                    disabled={busy}
                    title={t.releaseThisSeat}
                    style={iconBtnStyle}
                  >
                    {t.releaseAction}
                  </button>
                )}
              </div>
            )
          }

          if (slot.kind === "invite") {
            const inv = slot.invite
            return (
              <div key={`i-${inv.id}`} style={{
                ...memberRowStyle,
                background: "rgba(245,158,11,0.04)",
                border: "1px solid rgba(245,158,11,0.20)",
              }}>
                <Avatar letter={inv.email[0]?.toUpperCase() ?? "?"} dim />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={memberNameStyle}>{inv.email}</p>
                  <p style={memberSubStyle}>{t.invitePending}</p>
                </div>
                {isOwner && (
                  <button type="button" onClick={() => void revokeInvite(inv.id)} disabled={busy} style={iconBtnStyle}>
                    {t.cancelAction}
                  </button>
                )}
              </div>
            )
          }

          // Siège vide — affichage CTA ou mode édition inline.
          const isEditing = editingSlot === slot.index
          if (isEditing) {
            return (
              <div key={`e-${idx}`} style={emptySeatRowStyle(true)}>
                <Avatar letter="+" dim />
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder={t.inviteEmailPlaceholder}
                  autoFocus
                  disabled={busy}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void sendInvite()
                    if (e.key === "Escape") { setEditingSlot(-1); setInviteEmail("") }
                  }}
                  style={{ ...inputStyle, flex: 1, fontSize: 13, padding: "7px 10px" }}
                />
                <button
                  type="button"
                  onClick={sendInvite}
                  disabled={busy || !inviteEmail.trim()}
                  style={{
                    ...smallBtnPrimary,
                    opacity: busy || !inviteEmail.trim() ? 0.5 : 1,
                    cursor: busy || !inviteEmail.trim() ? "not-allowed" : "pointer",
                  }}
                >
                  {busy ? "…" : t.send}
                </button>
                <button
                  type="button"
                  onClick={() => { setEditingSlot(-1); setInviteEmail(""); setError(null) }}
                  disabled={busy}
                  style={iconBtnStyle}
                  title={t.cancelAction}
                >
                  ✕
                </button>
              </div>
            )
          }

          return (
            <div key={`e-${idx}`} style={emptySeatRowStyle(false)}>
              <Avatar letter="·" dim />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ ...memberNameStyle, color: "var(--nw-text-muted)", fontWeight: 600 }}>
                  {t.emptySeat}
                </p>
              </div>
              {isOwner && (
                <EmptySeatActions
                  unallocated={unallocatedMembers}
                  currentUserId={currentUserId}
                  busy={busy}
                  onInviteEmail={() => { setEditingSlot(slot.index); setError(null); setOkMessage(null) }}
                  onAllocate={(userId) => void allocateExistingMember(userId)}
                />
              )}
            </div>
          )
        })}
      </div>

      {error && <p style={{ margin: "10px 0 0", fontSize: 12, color: "#EF4444" }}>{error}</p>}
      {okMessage && <p style={{ margin: "10px 0 0", fontSize: 12, color: "var(--nw-success)" }}>{okMessage}</p>}

      <p style={{
        margin: "12px 0 0",
        fontSize: 11.5, color: "var(--nw-text-muted)", lineHeight: 1.55,
      }}>
        {t.footerNote}
      </p>
    </Card>
  )
}

const emptySeatRowStyle = (editing: boolean): React.CSSProperties => ({
  display: "flex", alignItems: "center", gap: 10,
  padding: editing ? "8px 10px" : "10px 12px",
  borderRadius: 10,
  background: editing ? "rgba(124,99,200,0.06)" : "rgba(243,244,246,0.55)",
  border: editing ? "1px solid rgba(124,99,200,0.30)" : "1px dashed var(--nw-border)",
})

/** Menu d'action sur un siège vide.
 *
 *  Si aucun membre sans siège n'existe -> simple bouton "+ Ajouter un
 *  membre" (invite par mail).
 *  Sinon -> dropdown qui propose :
 *    - "+ Ajouter un membre" (invite email, comme avant)
 *    - "M'allouer un siège" si l'owner courant n'a pas de siège
 *    - "Allouer à {first_name}" pour chaque membre non-alloué
 */
function EmptySeatActions({
  unallocated, currentUserId, busy, onInviteEmail, onAllocate,
}: {
  unallocated: MemberRow[]
  currentUserId: string
  busy: boolean
  onInviteEmail: () => void
  onAllocate: (userId: string) => void
}) {
  const { lang } = useLanguage()
  const t = copy[lang]
  const [open, setOpen] = useState(false)
  // Position fixe calculée sur le bouton : le menu est rendu via createPortal
  // dans <body> pour échapper à l'overflow:hidden de la carte Membres (sinon
  // le dropdown est coupé).
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  const openMenu = () => {
    const r = btnRef.current?.getBoundingClientRect()
    if (r) setPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) })
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return
      setOpen(false)
    }
    const close = () => setOpen(false)
    document.addEventListener("mousedown", onDown)
    window.addEventListener("resize", close)
    // capture=true : suit aussi le scroll d'un conteneur interne.
    window.addEventListener("scroll", close, true)
    return () => {
      document.removeEventListener("mousedown", onDown)
      window.removeEventListener("resize", close)
      window.removeEventListener("scroll", close, true)
    }
  }, [open])

  // Aucun membre disponible -> bouton simple, pas de dropdown.
  if (unallocated.length === 0) {
    return (
      <button
        type="button"
        onClick={onInviteEmail}
        disabled={busy}
        style={addMemberBtnStyle}
      >
        {t.addMember}
      </button>
    )
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openMenu())}
        disabled={busy}
        style={addMemberBtnStyle}
      >
        {t.allocateSeatDropdown}
      </button>
      {open && pos && createPortal(
        <div
          ref={menuRef}
          role="menu"
          style={{
            position: "fixed",
            top: pos.top,
            right: pos.right,
            minWidth: 240,
            background: "white",
            border: "1px solid var(--nw-border)",
            borderRadius: 10,
            boxShadow: "0 12px 32px -8px rgba(17,24,39,0.20)",
            padding: 5,
            zIndex: 1000,
            fontFamily: "var(--font-inter), sans-serif",
          }}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => { setOpen(false); onInviteEmail() }}
            style={dropdownItemStyle}
          >
            {t.inviteNewMember}
          </button>
          <div style={{ height: 1, background: "var(--nw-border-soft)", margin: "4px 0" }} />
          {unallocated.map((m) => {
            const isSelf = m.user_id === currentUserId
            return (
              <button
                key={m.user_id}
                type="button"
                role="menuitem"
                onClick={() => { setOpen(false); onAllocate(m.user_id) }}
                style={dropdownItemStyle}
              >
                {isSelf ? t.allocateToSelf : t.allocateTo(m.first_name ?? t.noFirstName)}
                {m.role === "owner" && !isSelf && (
                  <span style={{ marginLeft: 6, fontSize: 10.5, color: "var(--nw-text-muted)", fontWeight: 500 }}>
                    {t.ownerTag}
                  </span>
                )}
              </button>
            )
          })}
        </div>,
        document.body,
      )}
    </>
  )
}

const dropdownItemStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  padding: "8px 10px",
  borderRadius: 6,
  border: "none",
  background: "transparent",
  color: "var(--nw-text-body)",
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
}

const addMemberBtnStyle: React.CSSProperties = {
  padding: "6px 11px",
  borderRadius: 8,
  border: "1px solid rgba(124,99,200,0.30)",
  background: "white",
  color: "var(--nw-primary)",
  fontSize: 11.5,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "inherit",
  whiteSpace: "nowrap",
}

function Avatar({ letter, dim }: { letter: string; dim?: boolean }) {
  return (
    <div style={{
      width: 28, height: 28, borderRadius: "50%",
      background: dim ? "var(--nw-neutral-100)" : "linear-gradient(135deg, var(--nw-border-soft) 0%, var(--nw-primary-100) 100%)",
      border: dim ? "1px solid var(--nw-border)" : "1px solid rgba(124,99,200,0.30)",
      display: "flex", alignItems: "center", justifyContent: "center",
      color: dim ? "var(--nw-text-muted)" : "var(--nw-primary)",
      fontWeight: 700, fontSize: 11.5,
      flexShrink: 0,
    }}>
      {letter}
    </div>
  )
}

function RolePill({ role }: { role: "owner" | "member" }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700,
      color: role === "owner" ? "var(--nw-primary)" : "var(--nw-text-muted)",
      background: role === "owner" ? "rgba(124,99,200,0.08)" : "var(--nw-neutral-100)",
      border: role === "owner" ? "1px solid rgba(124,99,200,0.22)" : "1px solid var(--nw-border)",
      borderRadius: 100, padding: "2px 7px",
      fontFamily: "var(--nw-font-mono)", textTransform: "uppercase", letterSpacing: "0.06em",
      flexShrink: 0,
    }}>
      {role === "owner" ? "Owner" : "Member"}
    </span>
  )
}

/* ────────────────────────────────────────────────────────────────── */
/* Zone de danger                                                      */
/* ────────────────────────────────────────────────────────────────── */

function DangerSection({
  organization, isOwner, onChanged,
}: {
  organization: { id: string; name: string; pending_deletion_at: string | null }
  isOwner: boolean
  onChanged: () => void | Promise<void>
}) {
  const { lang } = useLanguage()
  const t = copy[lang]
  const [showModal, setShowModal] = useState(false)
  const [confirmText, setConfirmText] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const expectedConfirm = (organization.name || "").trim()
  const canDelete = confirmText.trim() === expectedConfirm && !busy

  const doDelete = async () => {
    if (!canDelete) return
    setBusy(true); setError(null)
    const res = await fetch("/api/cabinet", { method: "DELETE" })
    if (!res.ok) {
      const j = await res.json().catch(() => ({} as { error?: string }))
      setError(j.error ?? t.deleteError)
      setBusy(false)
      return
    }
    // Pas de déconnexion : l'owner reste connecté pour pouvoir ANNULER pendant
    // la grâce. L'org passe en lecture seule, l'UI se rafraîchit et bascule sur
    // l'état "Suppression programmée · Annuler".
    setShowModal(false); setConfirmText(""); setBusy(false)
    await onChanged()
  }

  const cancelDeletion = async () => {
    setBusy(true); setError(null)
    const res = await fetch("/api/cabinet/cancel-deletion", { method: "POST" })
    if (!res.ok) {
      const j = await res.json().catch(() => ({} as { error?: string }))
      setError(j.error ?? t.cancelDeletionError)
      setBusy(false)
      return
    }
    setBusy(false)
    await onChanged()
  }

  // ─ Suppression déjà programmée → carte de rappel + annulation.
  if (organization.pending_deletion_at) {
    const date = new Date(organization.pending_deletion_at).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", { day: "numeric", month: "long", year: "numeric" })
    return (
      <section style={{
        padding: "16px 18px", background: "white",
        border: "1px solid rgba(239,68,68,0.30)", borderRadius: 14, boxSizing: "border-box",
      }}>
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--nw-danger-strong)" }}>{t.deletionScheduled}</h2>
        <p style={{ margin: "4px 0 12px", fontSize: 12.5, color: "var(--nw-text-muted)", lineHeight: 1.55 }}>
          {t.orgWillBeDeletedReadOnly(date)}
        </p>
        {isOwner ? (
          <button type="button" onClick={cancelDeletion} disabled={busy}
            style={{
              padding: "8px 14px", borderRadius: 9, border: "1px solid rgba(124,99,200,0.35)",
              background: "white", color: "var(--nw-primary)", fontSize: 12.5, fontWeight: 700,
              cursor: busy ? "default" : "pointer",
            }}>
            {busy ? t.cancelling : t.cancelDeletion}
          </button>
        ) : (
          <p style={{ margin: 0, fontSize: 12, color: "var(--nw-text-muted)", fontStyle: "italic" }}>
            {t.ownerOnlyCancelDeletion}
          </p>
        )}
        {error && <p style={{ margin: "8px 0 0", fontSize: 12.5, color: "var(--nw-danger-strong)" }}>{error}</p>}
      </section>
    )
  }

  // ─ Suppression réservée à l'owner.
  if (!isOwner) return null

  return (
    <section style={{
      padding: "16px 18px", background: "white",
      border: "1px solid rgba(239,68,68,0.30)", borderRadius: 14, boxSizing: "border-box",
    }}>
      <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--nw-danger-strong)" }}>
        {t.dangerZone}
      </h2>
      <p style={{ margin: "4px 0 12px", fontSize: 12.5, color: "var(--nw-text-muted)", lineHeight: 1.55 }}>
        {t.deleteOrgBodyFull}
      </p>
      <button type="button" onClick={() => setShowModal(true)}
        style={{
          padding: "8px 14px", borderRadius: 9,
          border: "1px solid rgba(239,68,68,0.35)",
          background: "white", color: "var(--nw-danger-strong)",
          fontSize: 12.5, fontWeight: 700, cursor: "pointer",
        }}>
        {t.deleteMyOrg}
      </button>

      {showModal && (
        <div role="dialog" aria-modal="true"
          style={{
            position: "fixed", inset: 0, zIndex: 100,
            background: "rgba(17,24,39,0.55)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 20,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false) }}
        >
          <div style={{
            width: "100%", maxWidth: 480,
            background: "white", borderRadius: 16, padding: 28,
            border: "1px solid rgba(239,68,68,0.25)",
            boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
          }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "var(--nw-danger-strong)" }}>
              {t.deleteOrgConfirmTitle(organization.name)}
            </h3>
            <p style={{ margin: "10px 0 18px", fontSize: 13.5, color: "var(--nw-text-secondary)", lineHeight: 1.6 }}>
              {t.deleteOrgConfirmBody}
            </p>
            <Label>{t.typeOrgNameToConfirm} <code style={{ background: "var(--nw-neutral-100)", padding: "1px 6px", borderRadius: 4, color: "var(--nw-text)" }}>{expectedConfirm}</code></Label>
            <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)}
              placeholder={expectedConfirm} autoFocus style={inputStyle} />
            {error && <p style={{ margin: "12px 0 0", fontSize: 13, color: "#EF4444" }}>{error}</p>}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 22 }}>
              <button type="button" onClick={() => { setShowModal(false); setConfirmText(""); setError(null) }}
                disabled={busy} style={smallBtnGhost}>
                {t.cancel}
              </button>
              <button type="button" onClick={doDelete} disabled={!canDelete}
                style={{
                  padding: "10px 18px", borderRadius: 10,
                  border: "none", color: "white",
                  background: canDelete ? "var(--nw-danger-strong)" : "#FCA5A5",
                  fontSize: 13, fontWeight: 700,
                  cursor: canDelete ? "pointer" : "not-allowed",
                }}>
                {busy ? t.scheduling : t.scheduleDeletion}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

/* ────────────────────────────────────────────────────────────────── */
/* Transfert de propriété                                              */
/* ────────────────────────────────────────────────────────────────── */

function TransferOwnershipCard({
  currentUserId, onTransferred,
}: {
  currentUserId: string
  onTransferred: () => void | Promise<void>
}) {
  const [members, setMembers] = useState<Array<{ user_id: string; first_name: string | null; role: string }>>([])
  const [loading, setLoading] = useState(true)
  const [target, setTarget] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const { data } = await getSupabase()
        .from("profiles")
        .select("user_id, first_name, role")
        .neq("user_id", currentUserId)
      if (!mounted) return
      setMembers((data ?? []) as Array<{ user_id: string; first_name: string | null; role: string }>)
      setLoading(false)
    })()
    return () => { mounted = false }
  }, [currentUserId])

  if (loading) return null
  // Rien à transférer si l'owner est seul.
  if (members.length === 0) return null

  const label = (m: { first_name: string | null; user_id: string }) =>
    m.first_name?.trim() || `Membre ${m.user_id.slice(0, 6)}`

  const doTransfer = async () => {
    if (!target) return
    setBusy(true); setError(null)
    const res = await fetch("/api/cabinet/transfer-ownership", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: target }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({} as { error?: string }))
      setError(j.error ?? "Transfert impossible.")
      setBusy(false)
      return
    }
    setBusy(false); setConfirming(false)
    await onTransferred()
  }

  return (
    <section style={{
      padding: "16px 18px", background: "white",
      border: "1px solid var(--nw-border-soft)", borderRadius: 14, boxSizing: "border-box",
    }}>
      <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--nw-text)" }}>
        Transférer la propriété
      </h2>
      <p style={{ margin: "4px 0 12px", fontSize: 12.5, color: "var(--nw-text-muted)", lineHeight: 1.55 }}>
        Passez la main à un autre membre. Vous deviendrez membre de l&apos;organisation ;
        le nouveau propriétaire gérera l&apos;abonnement, les sièges et le branding.
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <select value={target} onChange={(e) => { setTarget(e.target.value); setConfirming(false) }}
          style={{ ...inputStyle, maxWidth: 260 }}>
          <option value="">Choisir un membre…</option>
          {members.map((m) => (
            <option key={m.user_id} value={m.user_id}>{label(m)}</option>
          ))}
        </select>
        {!confirming ? (
          <button type="button" onClick={() => target && setConfirming(true)} disabled={!target}
            style={{
              padding: "9px 14px", borderRadius: 9, border: "1px solid rgba(124,99,200,0.35)",
              background: "white", color: "var(--nw-primary)", fontSize: 12.5, fontWeight: 700,
              cursor: target ? "pointer" : "not-allowed",
            }}>
            Transférer
          </button>
        ) : (
          <button type="button" onClick={doTransfer} disabled={busy}
            style={{
              padding: "9px 14px", borderRadius: 9, border: "none",
              background: "var(--nw-primary)", color: "white", fontSize: 12.5, fontWeight: 700,
              cursor: busy ? "default" : "pointer",
            }}>
            {busy ? "Transfert…" : "Confirmer le transfert"}
          </button>
        )}
      </div>
      {error && <p style={{ margin: "8px 0 0", fontSize: 12.5, color: "var(--nw-danger-strong)" }}>{error}</p>}
    </section>
  )
}

/* ────────────────────────────────────────────────────────────────── */
/* Export RGPD — bouton de téléchargement                              */
/* ────────────────────────────────────────────────────────────────── */

function ExportDataCard() {
  const { lang } = useLanguage()
  const t = copy[lang]
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const download = () => {
    setBusy(true); setError(null)
    // Le navigateur déclenche le download via Content-Disposition. On
    // utilise un anchor invisible pour porter les credentials cookies.
    const a = document.createElement("a")
    a.href = "/api/export/me"
    a.download = ""
    a.rel = "noopener"
    document.body.appendChild(a)
    a.click()
    setTimeout(() => {
      document.body.removeChild(a)
      setBusy(false)
    }, 1500)
  }

  return (
    <section style={{
      padding: "16px 18px",
      background: "white",
      border: "1px solid var(--nw-border-soft)",
      borderRadius: 14,
      boxSizing: "border-box",
    }}>
      <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--nw-text)" }}>
        {t.exportMyData}
      </h2>
      <p style={{ margin: "4px 0 12px", fontSize: 12.5, color: "var(--nw-text-muted)", lineHeight: 1.55 }}>
        {t.exportBody}
      </p>
      <p style={{ margin: "0 0 14px", fontSize: 11.5, color: "var(--nw-text-muted)", lineHeight: 1.55 }}>
        {t.exportDisclaimer}
      </p>
      <button
        type="button"
        onClick={download}
        disabled={busy}
        style={{
          padding: "8px 14px", borderRadius: 9,
          border: "1px solid rgba(124,99,200,0.30)",
          background: "white", color: "var(--nw-primary)",
          fontSize: 12.5, fontWeight: 700,
          cursor: busy ? "wait" : "pointer",
        }}
      >
        {busy ? t.preparing : t.downloadJson}
      </button>
      {error && <p style={{ margin: "10px 0 0", fontSize: 12, color: "var(--nw-danger-strong)" }}>{error}</p>}
    </section>
  )
}

/* ────────────────────────────────────────────────────────────────── */
/* Shared building blocks                                              */
/* ────────────────────────────────────────────────────────────────── */

function Card({ title, subtitle, children, headerRight }: {
  title: string
  subtitle: string
  children: React.ReactNode
  /** Action optionnelle alignée à droite du titre (bouton Replier, etc.) */
  headerRight?: React.ReactNode
}) {
  return (
    <section style={{
      padding: "16px 18px",
      background: "white",
      border: "1px solid var(--nw-border-soft)",
      borderRadius: 14,
      height: "100%",
      boxSizing: "border-box",
      display: "flex",
      flexDirection: "column",
    }}>
      <div style={{
        display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8,
        marginBottom: 4,
      }}>
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--nw-text)" }}>{title}</h2>
        {headerRight}
      </div>
      <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--nw-text-muted)" }}>{subtitle}</p>
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        {children}
      </div>
    </section>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label style={{
      display: "block", marginBottom: 5,
      fontSize: 11.5, fontWeight: 700, color: "var(--nw-text-muted)",
      letterSpacing: "0.03em",
    }}>
      {children}
    </label>
  )
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ margin: "5px 0 0", fontSize: 11.5, color: "var(--nw-text-muted)", lineHeight: 1.5 }}>{children}</p>
  )
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 11px",
  borderRadius: 8, border: "1.5px solid var(--nw-border)",
  fontSize: 13.5, color: "var(--nw-text)",
  outline: "none", transition: "border-color 150ms",
  fontFamily: "var(--font-inter), sans-serif",
  boxSizing: "border-box",
}

const smallBtnPrimary: React.CSSProperties = {
  padding: "8px 13px", borderRadius: 8,
  border: "none", color: "white",
  background: "var(--nw-primary)",
  fontSize: 12, fontWeight: 700, cursor: "pointer",
  fontFamily: "var(--font-inter), sans-serif",
  whiteSpace: "nowrap",
}

const smallBtnGhost: React.CSSProperties = {
  padding: "8px 13px", borderRadius: 8,
  border: "1px solid var(--nw-border)", background: "white",
  color: "var(--nw-text-body)",
  fontSize: 12, fontWeight: 600, cursor: "pointer",
  fontFamily: "var(--font-inter), sans-serif",
  whiteSpace: "nowrap",
}

const iconBtnStyle: React.CSSProperties = {
  padding: "5px 9px", borderRadius: 7,
  border: "1px solid var(--nw-border)", background: "white",
  color: "var(--nw-text-muted)", fontSize: 11, fontWeight: 600,
  cursor: "pointer", flexShrink: 0,
  fontFamily: "var(--font-inter), sans-serif",
}

const memberRowStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 9,
  padding: "7px 9px",
  background: "var(--nw-surface-muted)",
  border: "1px solid var(--nw-border-soft)",
  borderRadius: 10,
}
const memberNameStyle: React.CSSProperties = {
  margin: 0, fontSize: 12.5, fontWeight: 600, color: "var(--nw-text)",
  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
}
const memberSubStyle: React.CSSProperties = {
  margin: "1px 0 0", fontSize: 11, color: "var(--nw-text-muted)",
  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
}
