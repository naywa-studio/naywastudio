"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { LazyMotion, domAnimation, m } from "framer-motion"
import { Logo } from "@/components/ui/Logo"
import { ShaderBackground } from "@/components/ui/ShaderBackground"
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher"
import { getSupabase } from "@/lib/supabase"
import { TRIAL_DURATION_DAYS } from "@/lib/trial"
import { BrandColorPicker } from "@/components/organisation/BrandColorPicker"
import { useLanguage } from "@/lib/i18n/LanguageContext"
import type { Profile } from "@/lib/database.types"

/**
 * /onboarding
 *
 * Premier passage de l'owner. 4 étapes :
 *   1. Nom de l'organisation (placeholder seulement, pas de pré-remplissage)
 *   2. Branding — logo + couleur + slogan + mail de contact (optionnel,
 *      sert au PDF anonymisé envoyé aux clients finaux)
 *   3. Invitations équipe (optionnel)
 *   4. Package Sourcing — 15 j offerts (activate ou skip)
 *
 * Stripe Setup Intent SEPA viendra après l'activation du trial dans une
 * deuxième passe (sprint A4). Pour l'instant l'activation du trial stamp
 * juste trial_ends_at et redirige vers /organisation.
 *
 * Route standalone, hors /organisation, pour que l'owner ne voie pas la
 * chrome de la console pendant le flow.
 */

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

const copy = {
  fr: {
    loading: "Chargement…",
    // Step 1
    welcomeWithName: (name: string) => `Bienvenue dans votre espace ${name}`,
    welcome: "Bienvenue dans votre espace",
    step1Subtitle: "Donnez un nom à votre organisation. Il sera visible par vos collègues et apparaîtra sur les documents que vous générez (PDF anonymisé, fiche pricing…).",
    orgNameLabel: "Nom de l'organisation",
    orgNamePlaceholderWithName: (name: string) => `Organisation de ${name}`,
    orgNamePlaceholder: "Organisation Dupont",
    orgNameHint: "Vous pourrez le modifier à tout moment depuis votre console.",
    continueBtn: "Continuer",
    errNoOrgName: "Donnez un nom à votre organisation pour continuer.",
    // Step 2
    brandingTitlePrefix: "Votre ",
    brandingTitleItalic: "identité visuelle",
    step2Subtitle: "Tout est optionnel. Ces éléments apparaîtront sur les CV anonymisés que vous générerez pour vos clients, et leur permettront de vous recontacter au sujet d'un candidat.",
    logoLabel: "Logo",
    logoNone: "Aucun",
    logoReplace: "Remplacer",
    logoUpload: "Téléverser",
    logoRemove: "Retirer",
    colorsLabel: "Couleurs de marque",
    colorsHint: "Non configurée = rendu en noir sur le PDF anonymisé. Choisissez une couleur de votre logo ou de la palette suggérée.",
    sloganLabel: "Slogan (optionnel)",
    sloganPlaceholder: "Recruter, c'est notre métier",
    sloganCounter: (n: number) => `${n}/120 caractères`,
    contactEmailLabel: "Email de contact",
    contactEmailPlaceholder: "contact@votre-cabinet.com",
    contactEmailHint: "Ce mail sera ajouté aux CV anonymisés et permettra à vos clients de vous recontacter au sujet des candidats.",
    saving: "Sauvegarde…",
    skipStep: "Passer cette étape",
    errBrandSave: "Sauvegarde branding impossible",
    errColorSave: "Sauvegarde couleur impossible",
    errUnknown: "Erreur inconnue",
    errLogoSaveFail: "Logo téléversé mais sauvegarde en échec.",
    errLogoUpload: "Erreur upload logo",
    errLogoRemove: "Erreur suppression logo",
    // Step 3
    inviteTitlePrefix: "Invitez votre ",
    inviteTitleItalic: "équipe",
    step3Subtitle: "Optionnel. Vos collègues recevront un mail pour rejoindre l'organisation. Vous pourrez en inviter d'autres à tout moment depuis votre console.",
    invitePlaceholderFirst: "collegue@cabinet.com",
    invitePlaceholderOther: "autre.collegue@cabinet.com",
    removeRowTitle: "Retirer cette ligne",
    addInvite: "+ Ajouter une invitation",
    sending: "Envoi…",
    // Step 4
    lastStep: "Dernière étape",
    packageTitlePrefix: "Package Sourcing, ",
    packageTitleItalic: (n: number) => `${n} jours offerts`,
    step4Subtitle: "Tout le workspace Nora pour votre organisation. Sans engagement, annulable à tout moment.",
    packageName: "Package Sourcing",
    packageTagline: "Nora, l'assistante IA du sourceur",
    trialBadge: (n: number) => `Essai gratuit ${n} j`,
    features: [
      "Vivier illimité, upload PDF, OCR et parsing IA",
      "Vos candidats classés par secteur automatiquement",
      "Matching IA contre vos missions avec score justifié",
      "Anonymisation PDF en 1 clic",
      "Pipeline candidat avec suivi des relances et entretiens",
      "Pricing Syntec automatisé + export PDF",
    ],
    activating: "Activation en cours…",
    activateBtn: (n: number) => `Activer mes ${n} jours gratuits`,
    continueWithoutActivating: "Continuer sans activer pour l'instant",
    canActivateLater: "Vous pourrez activer l'essai à tout moment depuis votre console.",
    errOnboardingFail: "Onboarding impossible",
    errActivationFail: "Activation impossible",
  },
  en: {
    loading: "Loading…",
    // Step 1
    welcomeWithName: (name: string) => `Welcome to your workspace ${name}`,
    welcome: "Welcome to your workspace",
    step1Subtitle: "Give your organization a name. It will be visible to your colleagues and appear on the documents you generate (anonymized PDF, pricing sheet…).",
    orgNameLabel: "Organization name",
    orgNamePlaceholderWithName: (name: string) => `${name}'s Organization`,
    orgNamePlaceholder: "Dupont Organization",
    orgNameHint: "You can change it at any time from your console.",
    continueBtn: "Continue",
    errNoOrgName: "Give your organization a name to continue.",
    // Step 2
    brandingTitlePrefix: "Your ",
    brandingTitleItalic: "visual identity",
    step2Subtitle: "Everything is optional. These elements will appear on the anonymized CVs you generate for your clients, and let them reach you about a candidate.",
    logoLabel: "Logo",
    logoNone: "None",
    logoReplace: "Replace",
    logoUpload: "Upload",
    logoRemove: "Remove",
    colorsLabel: "Brand colors",
    colorsHint: "Not set = rendered in black on the anonymized PDF. Pick a color from your logo or the suggested palette.",
    sloganLabel: "Slogan (optional)",
    sloganPlaceholder: "Recruiting is our craft",
    sloganCounter: (n: number) => `${n}/120 characters`,
    contactEmailLabel: "Contact email",
    contactEmailPlaceholder: "contact@your-firm.com",
    contactEmailHint: "This email will be added to anonymized CVs and let your clients reach you about candidates.",
    saving: "Saving…",
    skipStep: "Skip this step",
    errBrandSave: "Could not save branding",
    errColorSave: "Could not save color",
    errUnknown: "Unknown error",
    errLogoSaveFail: "Logo uploaded but the save failed.",
    errLogoUpload: "Logo upload error",
    errLogoRemove: "Logo removal error",
    // Step 3
    inviteTitlePrefix: "Invite your ",
    inviteTitleItalic: "team",
    step3Subtitle: "Optional. Your colleagues will get an email to join the organization. You can invite more at any time from your console.",
    invitePlaceholderFirst: "colleague@yourfirm.com",
    invitePlaceholderOther: "other.colleague@yourfirm.com",
    removeRowTitle: "Remove this row",
    addInvite: "+ Add an invite",
    sending: "Sending…",
    // Step 4
    lastStep: "Last step",
    packageTitlePrefix: "Package Sourcing, ",
    packageTitleItalic: (n: number) => `${n} days free`,
    step4Subtitle: "The entire Nora workspace for your organization. No commitment, cancel anytime.",
    packageName: "Package Sourcing",
    packageTagline: "Nora, the sourcer's AI assistant",
    trialBadge: (n: number) => `${n}-day free trial`,
    features: [
      "Unlimited talent pool, PDF upload, OCR and AI parsing",
      "Your candidates automatically classified by sector",
      "AI matching against your missions with a justified score",
      "One-click anonymized PDF",
      "Candidate pipeline with follow-up and interview tracking",
      "Automated Syntec pricing + PDF export",
    ],
    activating: "Activating…",
    activateBtn: (n: number) => `Activate my ${n} free days`,
    continueWithoutActivating: "Continue without activating for now",
    canActivateLater: "You can activate the trial at any time from your console.",
    errOnboardingFail: "Onboarding failed",
    errActivationFail: "Activation failed",
  },
}

interface InviteRow {
  id: string
  email: string
}

const TOTAL_STEPS = 4

export default function OnboardingPage() {
  const router = useRouter()
  const { lang } = useLanguage()
  const t = copy[lang]
  const [profile, setProfile] = useState<Profile | null>(null)
  const [orgId, setOrgId] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [cabinetName, setCabinetName] = useState("")
  // Step 2 branding — tous optionnels. Couleurs null = noir par défaut
  // côté rendu PDF, conformément à la décision produit "défaut off".
  const [brandColor, setBrandColor] = useState<string | null>(null)
  const [brandColorSecondary, setBrandColorSecondary] = useState<string | null>(null)
  const [savingBrand, setSavingBrand] = useState(false)
  const [brandSlogan, setBrandSlogan] = useState("")
  const [contactEmail, setContactEmail] = useState("")
  const [logoPath, setLogoPath] = useState<string | null>(null)
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const [invites, setInvites] = useState<InviteRow[]>([
    { id: crypto.randomUUID(), email: "" },
  ])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const sb = getSupabase()
      const { data: { user } } = await sb.auth.getUser()
      if (!user) { router.replace("/login?next=/onboarding"); return }
      const { data: prof } = await sb.from("profiles").select("*").eq("user_id", user.id).single()
      if (!prof) { router.replace("/login"); return }
      const { data: org } = await sb.from("organizations").select("*").eq("id", prof.organization_id).single()
      if (cancelled) return
      if (prof.role !== "owner") { router.replace("/workspace"); return }
      if (org?.cabinet_onboarded_at) { router.replace("/organisation"); return }
      setProfile(prof as Profile)
      setOrgId(prof.organization_id)
      setReady(true)
    })()
    return () => { cancelled = true }
  }, [router])

  const greetingName = useMemo(() => profile?.first_name?.trim() ?? "", [profile?.first_name])

  const addInviteRow = () => {
    if (invites.length >= 5) return
    setInvites((rows) => [...rows, { id: crypto.randomUUID(), email: "" }])
  }
  const removeInviteRow = (id: string) => {
    setInvites((rows) => rows.length === 1 ? rows : rows.filter((r) => r.id !== id))
  }
  const updateInvite = (id: string, email: string) => {
    setInvites((rows) => rows.map((r) => r.id === id ? { ...r, email } : r))
  }

  const finishStep1 = () => {
    setError(null)
    if (!cabinetName.trim()) {
      setError(t.errNoOrgName)
      return
    }
    setStep(2)
  }

  /** Étape 2 — branding. Tout est optionnel. Les couleurs sont déjà
   *  persistées live par BrandColorPicker (via patchBrandColors). Ici
   *  on flush juste slogan + contact email avant de passer à l'étape
   *  suivante. */
  const finishStep2 = async () => {
    if (submitting) return
    setError(null)
    setSubmitting(true)
    try {
      const body: Record<string, unknown> = {}
      if (brandSlogan.trim()) body.brand_slogan = brandSlogan.trim()
      if (contactEmail.trim()) body.contact_email = contactEmail.trim()
      if (Object.keys(body).length > 0) {
        const res = await fetch("/api/cabinet", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const j = await res.json().catch(() => ({} as { error?: string }))
          throw new Error(j.error ?? t.errBrandSave)
        }
      }
      setStep(3)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t.errUnknown)
    } finally {
      setSubmitting(false)
    }
  }

  /** Persistance live des couleurs côté DB — déclenchée par
   *  BrandColorPicker à chaque sélection. */
  const patchBrandColors = async (
    patch: { brand_color?: string | null; brand_color_secondary?: string | null },
  ) => {
    setSavingBrand(true); setError(null)
    try {
      const res = await fetch("/api/cabinet", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({} as { error?: string }))
        throw new Error(j.error ?? t.errColorSave)
      }
      if ("brand_color" in patch) setBrandColor(patch.brand_color ?? null)
      if ("brand_color_secondary" in patch) setBrandColorSecondary(patch.brand_color_secondary ?? null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t.errUnknown)
    } finally {
      setSavingBrand(false)
    }
  }

  const uploadLogo = async (file: File) => {
    if (!orgId) return
    setUploadingLogo(true); setError(null)
    try {
      const sb = getSupabase()
      const ext = file.name.split(".").pop() || "png"
      const path = `${orgId}/${Date.now()}.${ext}`
      const { error: upErr } = await sb.storage
        .from("brand-logos")
        .upload(path, file, { upsert: true })
      if (upErr) throw new Error(upErr.message)
      const res = await fetch("/api/cabinet", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand_logo_path: path }),
      })
      if (!res.ok) throw new Error(t.errLogoSaveFail)
      setLogoPath(path)
      const { data: signed } = await sb.storage
        .from("brand-logos")
        .createSignedUrl(path, 3600)
      setLogoPreviewUrl(signed?.signedUrl ?? null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t.errLogoUpload)
    } finally {
      setUploadingLogo(false)
    }
  }

  const removeLogo = async () => {
    if (!logoPath) return
    setUploadingLogo(true); setError(null)
    try {
      const sb = getSupabase()
      await sb.storage.from("brand-logos").remove([logoPath])
      await fetch("/api/cabinet", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand_logo_path: null }),
      })
      setLogoPath(null)
      setLogoPreviewUrl(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t.errLogoRemove)
    } finally {
      setUploadingLogo(false)
    }
  }

  /** Étape 3 — envoie les invitations valides (silencieux sur celles qui
   *  échouent : un membre peut être re-invité plus tard depuis la console).
   *  Si tous les champs sont vides, on saute. */
  const finishStep3 = async () => {
    if (submitting) return
    setError(null)
    const valid = invites
      .map((r) => r.email.trim().toLowerCase())
      .filter((e) => e.length > 0 && /.+@.+\..+/.test(e))
    if (valid.length === 0) {
      setStep(4)
      return
    }
    setSubmitting(true)
    try {
      // Tir parallèle, on garde les erreurs silencieuses : l'owner pourra
      // recommencer depuis /organisation. On affiche juste un toast soft.
      await Promise.allSettled(
        valid.map((email) =>
          fetch("/api/cabinet/invite", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email }),
          })
        )
      )
      setStep(4)
    } finally {
      setSubmitting(false)
    }
  }

  /** Étape 4 — stamp onboarding done puis :
   *    - activateTrial: POST /api/cabinet/activate-trial (stamp + consume),
   *      atterrissage /organisation où l'owner choisira d'ajouter son
   *      moyen de paiement maintenant ou plus tard (via TrialChoiceModal).
   *    - sinon: redirige /organisation sans rien activer.
   *
   *  Si activate-trial répond 409 (déjà consommé), on remonte le message
   *  utilisateur pour qu'il puisse souscrire directement. */
  const finalize = async (opts: { activateTrial: boolean }) => {
    if (submitting) return
    setSubmitting(true)
    setError(null)
    try {
      // 1. Persist cabinet name + stamp onboarded.
      const res = await fetch("/api/cabinet/onboarding-done", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cabinetName: cabinetName.trim() }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? t.errOnboardingFail)
      }
      // 2. Si trial demandé -> stamp app-side. L'owner configurera son
      // moyen de paiement plus tard depuis /organisation.
      if (opts.activateTrial) {
        const tr = await fetch("/api/cabinet/activate-trial", { method: "POST" })
        if (!tr.ok) {
          const body = await tr.json().catch(() => ({}))
          throw new Error(body.error ?? t.errActivationFail)
        }
      }
      router.replace("/organisation")
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t.errUnknown)
      setSubmitting(false)
    }
  }

  if (!ready) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#FAFAFA" }}>
        <span style={{ color: "#6B7280", fontSize: 14, fontFamily: "var(--font-inter), sans-serif" }}>
          {t.loading}
        </span>
      </div>
    )
  }

  return (
    <LazyMotion features={domAnimation}>
      <ShaderBackground />
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "32px 20px 64px",
          fontFamily: "var(--font-inter), sans-serif",
          position: "relative",
          zIndex: 2,
        }}
      >
        <div style={{
          width: "100%", maxWidth: 620,
          display: "flex", justifyContent: "flex-end", marginBottom: 4,
        }}>
          <LanguageSwitcher />
        </div>

        <div style={{ marginBottom: 28 }}>
          <Logo size="md" />
        </div>

        <m.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE }}
          style={{
            width: "100%",
            maxWidth: 620,
            background: "white",
            borderRadius: 24,
            border: "1px solid #F0ECF8",
            boxShadow: "0 24px 64px -24px rgba(17,24,39,0.18)",
            padding: "40px 36px 32px",
          }}
        >
          {/* Step indicator — 4 dots avec connecteurs */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 28 }}>
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => {
              const stepNumber = (i + 1) as 1 | 2 | 3 | 4
              const isLast = stepNumber === TOTAL_STEPS
              return (
                <React.Fragment key={stepNumber}>
                  <StepDot active={step >= stepNumber} done={step > stepNumber} />
                  {!isLast && (
                    <div style={{
                      flex: 1, height: 1,
                      background: step > stepNumber ? "#7C63C8" : "#E2DAF6",
                    }} />
                  )}
                </React.Fragment>
              )
            })}
          </div>

          {/* STEP 1 — nom organisation */}
          {step === 1 && (
            <m.div key="s1" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }}>
              <h1 style={titleStyle}>
                {greetingName ? t.welcomeWithName(greetingName) : t.welcome}
              </h1>
              <p style={subtitleStyle}>
                {t.step1Subtitle}
              </p>

              <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <span style={fieldLabelStyle}>{t.orgNameLabel}</span>
                <input
                  type="text"
                  value={cabinetName}
                  onChange={(e) => setCabinetName(e.target.value)}
                  placeholder={profile?.first_name ? t.orgNamePlaceholderWithName(profile.first_name) : t.orgNamePlaceholder}
                  maxLength={120}
                  autoFocus
                  style={inputStyle}
                />
                <span style={fieldHintStyle}>
                  {t.orgNameHint}
                </span>
              </label>

              {error && <ErrorBox text={error} />}
              <button onClick={finishStep1} style={primaryBtn(false)}>{t.continueBtn}</button>
            </m.div>
          )}

          {/* STEP 2 — branding cabinet */}
          {step === 2 && (
            <m.div key="s2" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }}>
              <h1 style={titleStyle}>
                {t.brandingTitlePrefix}
                <span style={italicAccentStyle}>{t.brandingTitleItalic}</span>
              </h1>
              <p style={subtitleStyle}>
                {t.step2Subtitle}
              </p>

              {/* Logo */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
                <span style={fieldLabelStyle}>{t.logoLabel}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{
                    width: 72, height: 72,
                    borderRadius: 14, border: "1.5px dashed #E2DAF6",
                    background: "#FAFAFA",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    overflow: "hidden", flexShrink: 0,
                  }}>
                    {logoPreviewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={logoPreviewUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", padding: 8 }} />
                    ) : (
                      <span style={{ fontSize: 10, color: "#6B7280" }}>{t.logoNone}</span>
                    )}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <button
                      type="button"
                      onClick={() => fileInput.current?.click()}
                      disabled={uploadingLogo}
                      style={brandingSmallBtn(false)}
                    >
                      {uploadingLogo ? "…" : logoPath ? t.logoReplace : t.logoUpload}
                    </button>
                    {logoPath && (
                      <button type="button" onClick={removeLogo} disabled={uploadingLogo} style={brandingSmallBtn(true)}>
                        {t.logoRemove}
                      </button>
                    )}
                  </div>
                </div>
                <input ref={fileInput} type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) { void uploadLogo(f); e.target.value = "" }
                  }}
                />
              </div>

              {/* Couleurs — picker complet (palette curated + extraction logo + bicolore) */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
                <span style={fieldLabelStyle}>{t.colorsLabel}</span>
                <span style={{ ...fieldHintStyle, marginBottom: 4 }}>
                  {t.colorsHint}
                </span>
                <BrandColorPicker
                  primary={brandColor}
                  secondary={brandColorSecondary}
                  isOwner
                  logoUrl={logoPreviewUrl}
                  saving={savingBrand}
                  onSave={patchBrandColors}
                />
              </div>

              {/* Slogan */}
              <label style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
                <span style={fieldLabelStyle}>{t.sloganLabel}</span>
                <input
                  type="text"
                  value={brandSlogan}
                  onChange={(e) => setBrandSlogan(e.target.value.slice(0, 120))}
                  placeholder={t.sloganPlaceholder}
                  maxLength={120}
                  style={inputStyle}
                />
                <span style={fieldHintStyle}>{t.sloganCounter(brandSlogan.length)}</span>
              </label>

              {/* Contact email */}
              <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <span style={fieldLabelStyle}>{t.contactEmailLabel}</span>
                <input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder={t.contactEmailPlaceholder}
                  style={inputStyle}
                />
                <span style={fieldHintStyle}>
                  {t.contactEmailHint}
                </span>
              </label>

              {error && <ErrorBox text={error} />}

              <button onClick={finishStep2} disabled={submitting || uploadingLogo} style={primaryBtn(submitting || uploadingLogo)}>
                {submitting ? t.saving : t.continueBtn}
              </button>
              <button onClick={() => setStep(3)} disabled={submitting || uploadingLogo} style={skipBtnStyle(submitting || uploadingLogo)}>
                {t.skipStep}
              </button>
            </m.div>
          )}

          {/* STEP 3 — invitations */}
          {step === 3 && (
            <m.div key="s3" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }}>
              <h1 style={titleStyle}>
                {t.inviteTitlePrefix}
                <span style={italicAccentStyle}>{t.inviteTitleItalic}</span>
              </h1>
              <p style={subtitleStyle}>
                {t.step3Subtitle}
              </p>

              <div style={{ display: "grid", gap: 10, marginBottom: 6 }}>
                {invites.map((row, idx) => (
                  <div key={row.id} style={{ display: "flex", gap: 8 }}>
                    <input
                      type="email"
                      value={row.email}
                      onChange={(e) => updateInvite(row.id, e.target.value)}
                      placeholder={idx === 0 ? t.invitePlaceholderFirst : t.invitePlaceholderOther}
                      style={{ ...inputStyle, flex: 1 }}
                    />
                    {invites.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeInviteRow(row.id)}
                        style={smallIconBtn}
                        title={t.removeRowTitle}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {invites.length < 5 && (
                <button type="button" onClick={addInviteRow} style={linkBtnStyle}>
                  {t.addInvite}
                </button>
              )}

              {error && <ErrorBox text={error} />}

              <button
                onClick={finishStep3}
                disabled={submitting}
                style={primaryBtn(submitting)}
              >
                {submitting ? t.sending : t.continueBtn}
              </button>

              <button
                onClick={() => setStep(4)}
                disabled={submitting}
                style={skipBtnStyle(submitting)}
              >
                {t.skipStep}
              </button>
            </m.div>
          )}

          {/* STEP 4 — package */}
          {step === 4 && (
            <m.div key="s4" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }}>
              <span style={kickerStyle}>{t.lastStep}</span>
              <h1 style={titleStyle}>
                {t.packageTitlePrefix}
                <span style={italicAccentStyle}>{t.packageTitleItalic(TRIAL_DURATION_DAYS)}</span>
              </h1>
              <p style={subtitleStyle}>
                {t.step4Subtitle}
              </p>

              <div style={{
                background: "linear-gradient(165deg, #F8F6FF 0%, #F0ECF8 100%)",
                border: "1px solid #E2DAF6",
                borderRadius: 16,
                padding: "22px 22px 24px",
                marginBottom: 24,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
                  <div>
                    <p style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700, color: "#111827", letterSpacing: "-0.01em" }}>
                      {t.packageName}
                    </p>
                    <p style={{ margin: 0, fontSize: 12, color: "#7C63C8", fontWeight: 600 }}>
                      {t.packageTagline}
                    </p>
                  </div>
                  <span style={{
                    background: "white", border: "1px solid rgba(124,99,200,0.30)",
                    color: "#7C63C8", fontSize: 11, fontWeight: 700,
                    padding: "5px 10px", borderRadius: 999,
                    letterSpacing: "0.04em", textTransform: "uppercase",
                  }}>
                    {t.trialBadge(TRIAL_DURATION_DAYS)}
                  </span>
                </div>

                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 9 }}>
                  {t.features.map((feat) => (
                    <li key={feat} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 13.5, color: "#374151", lineHeight: 1.5 }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7C63C8" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 3 }}>
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {error && <ErrorBox text={error} />}

              <button
                onClick={() => finalize({ activateTrial: true })}
                disabled={submitting}
                style={primaryBtn(submitting)}
              >
                {submitting ? t.activating : t.activateBtn(TRIAL_DURATION_DAYS)}
              </button>

              <button
                onClick={() => finalize({ activateTrial: false })}
                disabled={submitting}
                style={skipBtnStyle(submitting)}
              >
                {submitting ? t.saving : t.continueWithoutActivating}
              </button>

              <p style={{ margin: "16px 0 0", fontSize: 11.5, color: "#6B7280", textAlign: "center", lineHeight: 1.5 }}>
                {t.canActivateLater}
              </p>
            </m.div>
          )}
        </m.div>
      </div>
    </LazyMotion>
  )
}

/* ─────────────── styles ─────────────── */

const titleStyle: React.CSSProperties = {
  margin: "0 0 8px",
  fontSize: 26,
  fontWeight: 700,
  color: "#111827",
  letterSpacing: "-0.02em",
  lineHeight: 1.18,
}
const subtitleStyle: React.CSSProperties = {
  margin: "0 0 24px",
  fontSize: 14.5,
  color: "#4B5563",
  lineHeight: 1.65,
}
const kickerStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "#7C63C8",
  letterSpacing: "0.10em",
  textTransform: "uppercase",
}
const italicAccentStyle: React.CSSProperties = {
  fontFamily: "var(--font-instrument-serif), serif",
  fontWeight: 400,
  fontStyle: "italic",
  color: "#7C63C8",
}
const fieldLabelStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: "#374151", letterSpacing: "0.01em",
}
const fieldHintStyle: React.CSSProperties = {
  fontSize: 11.5, color: "#6B7280",
}
const inputStyle: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid #E2DAF6",
  background: "white",
  fontSize: 15,
  color: "#111827",
  fontFamily: "inherit",
  outline: "none",
}
const linkBtnStyle: React.CSSProperties = {
  marginTop: 4,
  background: "transparent",
  border: "none",
  color: "#7C63C8",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  padding: "6px 0",
  textAlign: "left",
  fontFamily: "inherit",
}
const smallIconBtn: React.CSSProperties = {
  background: "white",
  border: "1px solid #E2DAF6",
  borderRadius: 10,
  color: "#6B7280",
  cursor: "pointer",
  padding: "0 12px",
}

function skipBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    width: "100%",
    marginTop: 10,
    padding: "12px 16px",
    borderRadius: 12,
    border: "1px solid transparent",
    background: "transparent",
    color: "#6B7280",
    fontSize: 13.5,
    fontWeight: 500,
    cursor: disabled ? "wait" : "pointer",
    fontFamily: "inherit",
  }
}

function StepDot({ active, done }: { active: boolean; done: boolean }) {
  const bg = done ? "#7C63C8" : "white"
  const border = done || active ? "#7C63C8" : "#E2DAF6"
  return (
    <span aria-hidden style={{
      width: 22, height: 22, borderRadius: "50%",
      background: bg, border: `2px solid ${border}`,
      display: "inline-flex", alignItems: "center", justifyContent: "center",
    }}>
      {done && (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
    </span>
  )
}

function ErrorBox({ text }: { text: string }) {
  return (
    <div style={{
      marginTop: 14,
      background: "rgba(239,68,68,0.08)",
      border: "1px solid rgba(239,68,68,0.25)",
      color: "#B91C1C",
      borderRadius: 10,
      padding: "10px 12px",
      fontSize: 13,
      fontWeight: 500,
    }}>
      {text}
    </div>
  )
}

function brandingSmallBtn(ghost: boolean): React.CSSProperties {
  return {
    padding: "8px 14px",
    borderRadius: 8,
    border: ghost ? "1px solid #E2DAF6" : "1px solid transparent",
    background: ghost ? "white" : "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
    color: ghost ? "#6B7280" : "white",
    fontSize: 12.5,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
    boxShadow: ghost ? "none" : "0 4px 12px -4px rgba(124,99,200,0.45)",
  }
}

function primaryBtn(disabled: boolean): React.CSSProperties {
  return {
    width: "100%",
    marginTop: 22,
    padding: "14px 24px",
    borderRadius: 12,
    border: "none",
    background: "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
    color: "white",
    fontSize: 15,
    fontWeight: 700,
    letterSpacing: "-0.005em",
    cursor: disabled ? "wait" : "pointer",
    opacity: disabled ? 0.7 : 1,
    boxShadow: "0 8px 24px -6px rgba(124,99,200,0.55)",
    fontFamily: "inherit",
  }
}
