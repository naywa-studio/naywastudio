"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { m } from "framer-motion"
import { getSupabase } from "@/lib/supabase"
import type { Candidate, MatchAssessment, Job, MatchTier, PipelineStage, ScoreDimensions } from "@/lib/database.types"
import { kindOf, type Criterion, type CriterionEval } from "@/lib/job-criteria-catalog"
import { criterionHeaderLabel, shortCriterionLabel, dimColor, statusColor } from "@/lib/criterion-display"
import ComposeBox from "@/components/workspace/ComposeBox"
import { AnonymizeControls } from "@/components/workspace/anonymize/AnonymizeControls"
import { AnonymizedCvLivePreview } from "@/components/workspace/anonymize/AnonymizedCvLivePreview"
import { AnonymizeSidePanel } from "@/components/workspace/anonymize/AnonymizeSidePanel"
import type { AnonymizedJobContext, AnonymizedBrand } from "@/lib/anonymized-cv-model"
import { readSelection, readOrder, EMPTY_SELECTION, EMPTY_ORDER, type AnonymizeSelection, type AnonymizeOrder } from "@/lib/anonymize-selection"
import {
  INITIAL_ANONYMIZE_OPTIONS,
  INITIAL_ANONYMIZE_STATUS,
  type AnonymizeOptions,
  type AnonymizeStatus,
} from "@/components/workspace/anonymize/types"
import CandidateMiniKanban from "@/components/workspace/CandidateMiniKanban"
import Select from "@/components/ui/Select"
import { DetailSkeleton } from "@/components/workspace/PageSkeletons"
import { candidateRefLabel, candidateRefSlug } from "@/lib/candidate-ref"
import { useLanguage, type Lang } from "@/lib/i18n/LanguageContext"
import { useWorkspace } from "../../layout"
import { orgUsesClients } from "@/lib/org-type"
import { detectOffLimitsForCandidate, type OffLimitsClientRef } from "@/lib/off-limits"

const copy = {
  fr: {
    chooseMission: "Choisir la mission",
    viewPricing: "€ Voir le pricing",
    ref: "Ref",
    tierMeta: {
      excellent: { label: "Excellent match", fg: "var(--nw-success)", bg: "rgba(34,197,94,0.07)", bd: "rgba(34,197,94,0.25)" },
      good:      { label: "Bon match",       fg: "var(--nw-primary)", bg: "rgba(124,99,200,0.07)", bd: "rgba(124,99,200,0.22)" },
      fair:      { label: "Match moyen",     fg: "var(--nw-warn)", bg: "rgba(245,158,11,0.07)", bd: "rgba(245,158,11,0.22)" },
      poor:      { label: "Match faible",    fg: "var(--nw-text-muted)", bg: "#F9FAFB", bd: "var(--nw-border)" },
    } as Record<MatchTier, { label: string; fg: string; bg: string; bd: string }>,
    scoreDimLabels: {
      skills_match: "Skills", seniority_fit: "Séniorité", location_fit: "Lieu",
      experience_fit: "Expérience", language_fit: "Langue",
    } as Record<keyof ScoreDimensions, string>,
    loadingMatch: "Chargement du match",
    matchNotFound: "Match introuvable.",
    backToPipeline: "← Retour au pipeline",
    missionPrefix: (title: string) => `← Mission : ${title}`,
    pipelineArrow: "Pipeline →",
    noNameCandidate: "Candidat sans nom",
    forSuffix: " — pour ",
    noMission: "Sans mission",
    manual: "manuel",
    removeFromPipeline: "Retirer de la shortlist",
    followInPipeline: "Ajouter ce candidat à la shortlist",
    readOnlyPipeline: "Lecture seule — souscrivez pour gérer la shortlist",
    readOnlyLabel: "Lecture seule",
    inPipeline: "✓ Dans la shortlist",
    addToPipeline: "+ Ajouter à la shortlist",
    manuallyAssigned: "Assigné manuellement",
    candidateSheet: "Fiche candidat →",
    criteriaTitle: "✦ Critères de cette mission",
    mainLabel: "Principaux",
    bonusLabel: "Bonus",
    manualAssignmentTitle: "✋ Assignation manuelle",
    manualAssignmentBody: "Ajouté par le sourceur en dehors du matching automatique.",
    salaryExpectationTitle: "Prétention salariale",
    salaryPlaceholder: "Ex : 45 000",
    grossPerYear: (saving: boolean) => `€ brut / an${saving ? " · enregistrement…" : ""}`,
    fillTargetSalary: "Renseignez le salaire cible du poste (dans la mission) pour activer la comparaison.",
    targetSalaryOnly: (target: string) => (
      <>Salaire cible du poste : <strong>{target} €</strong></>
    ),
    targetSalaryLabel: "Cible du poste : ",
    aboveBudget: "Au-dessus du budget",
    inBudget: "Dans le budget",
    underBudget: "Sous le budget",
    candidateSummaryTitle: "Résumé candidat",
    yearsExp: (n: number) => `${n} an${n > 1 ? "s" : ""}`,
    experienceSuffix: "d'expérience",
    pathTitle: "Parcours",
    present: "auj.",
    approachMessageTitle: "✉ Message d'approche",
    availableOnceParsed: "Disponible une fois le CV parsé.",
    emptyServerResponse: (status: number) => `Réponse vide du serveur (${status}).`,
    unreadableServerResponse: "Réponse serveur illisible.",
    generating: "Génération…",
    generateDocument: "Générer le document",
    anonymizeFailed: "Échec de l'anonymisation.",
    networkError: "Erreur réseau.",
    anonymizeJump: "Personnaliser et télécharger le CV anonymisé",
    clientFeedbackTitle: "Retour client",
    clientFeedbackFor: (name: string) => `Mission pour ${name}`,
    clientFeedbackHint: "Notez ici le retour du client sur ce candidat. Le verdict (recruté / écarté) se gère dans l'onglet Revue client de la mission. Privé — aucun message n'est envoyé.",
    clientNotePlaceholder: "Retour du client (optionnel) — ex : profil trop junior, revoir la fourchette…",
    clientNoteSaving: "Enregistrement…",
    clientFeedbackAtLabel: (date: string) => `Mis à jour le ${date}`,
  },
  en: {
    chooseMission: "Choose the mission",
    viewPricing: "€ View pricing",
    ref: "Ref",
    tierMeta: {
      excellent: { label: "Excellent match", fg: "var(--nw-success)", bg: "rgba(34,197,94,0.07)", bd: "rgba(34,197,94,0.25)" },
      good:      { label: "Good match",      fg: "var(--nw-primary)", bg: "rgba(124,99,200,0.07)", bd: "rgba(124,99,200,0.22)" },
      fair:      { label: "Fair match",      fg: "var(--nw-warn)", bg: "rgba(245,158,11,0.07)", bd: "rgba(245,158,11,0.22)" },
      poor:      { label: "Weak match",      fg: "var(--nw-text-muted)", bg: "#F9FAFB", bd: "var(--nw-border)" },
    } as Record<MatchTier, { label: string; fg: string; bg: string; bd: string }>,
    scoreDimLabels: {
      skills_match: "Skills", seniority_fit: "Seniority", location_fit: "Location",
      experience_fit: "Experience", language_fit: "Language",
    } as Record<keyof ScoreDimensions, string>,
    loadingMatch: "Loading match",
    matchNotFound: "Match not found.",
    backToPipeline: "← Back to pipeline",
    missionPrefix: (title: string) => `← Mission: ${title}`,
    pipelineArrow: "Pipeline →",
    noNameCandidate: "Unnamed candidate",
    forSuffix: " — for ",
    noMission: "No mission",
    manual: "manual",
    removeFromPipeline: "Remove from shortlist",
    followInPipeline: "Add this candidate to the shortlist",
    readOnlyPipeline: "Read-only — subscribe to manage the shortlist",
    readOnlyLabel: "Read-only",
    inPipeline: "✓ In the shortlist",
    addToPipeline: "+ Add to shortlist",
    manuallyAssigned: "Manually assigned",
    candidateSheet: "Candidate profile →",
    criteriaTitle: "✦ Criteria for this mission",
    mainLabel: "Main",
    bonusLabel: "Bonus",
    manualAssignmentTitle: "✋ Manual assignment",
    manualAssignmentBody: "Added by the sourcer outside of automatic matching.",
    salaryExpectationTitle: "Salary expectation",
    salaryPlaceholder: "E.g.: 45,000",
    grossPerYear: (saving: boolean) => `€ gross / year${saving ? " · saving…" : ""}`,
    fillTargetSalary: "Fill in the position's target salary (in the mission) to enable the comparison.",
    targetSalaryOnly: (target: string) => (
      <>Position&apos;s target salary: <strong>{target} €</strong></>
    ),
    targetSalaryLabel: "Position target: ",
    aboveBudget: "Above budget",
    inBudget: "Within budget",
    underBudget: "Below budget",
    candidateSummaryTitle: "Candidate summary",
    yearsExp: (n: number) => `${n} year${n > 1 ? "s" : ""}`,
    experienceSuffix: "of experience",
    pathTitle: "Career path",
    present: "present",
    approachMessageTitle: "✉ Approach message",
    availableOnceParsed: "Available once the CV is parsed.",
    emptyServerResponse: (status: number) => `Empty response from server (${status}).`,
    unreadableServerResponse: "Unreadable server response.",
    generating: "Generating…",
    generateDocument: "Generate the document",
    anonymizeFailed: "Anonymization failed.",
    networkError: "Network error.",
    anonymizeJump: "Customize and download the anonymized CV",
    clientFeedbackTitle: "Client feedback",
    clientFeedbackFor: (name: string) => `Mission for ${name}`,
    clientFeedbackHint: "Record the client's feedback on this candidate here. The verdict (recruited / dropped) is managed in the mission's Client review tab. Private — no message is sent.",
    clientNotePlaceholder: "Client's feedback (optional) — e.g. profile too junior, revise the range…",
    clientNoteSaving: "Saving…",
    clientFeedbackAtLabel: (date: string) => `Updated on ${date}`,
  },
}

/* Bouton "Voir le pricing" — direct si 1 mission en pipeline, dropdown si N. */
function PricingShortcut({ targets, lang }: {
  targets: Array<{ job: { id: string; title: string } | null; score: number | null }>
  lang: Lang
}) {
  const t = copy[lang]
  const [open, setOpen] = useState(false)
  const withJob = targets.filter((tg) => tg.job?.id)
  if (withJob.length === 0) return null

  const btnStyle: React.CSSProperties = {
    fontFamily: "inherit", fontSize: 12, fontWeight: 700,
    color: "white",
    padding: "8px 12px", borderRadius: 9,
    background: "var(--nw-primary)",
    border: "1px solid rgba(124,99,200,0.40)",
    cursor: "pointer",
    display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none",
  }

  if (withJob.length === 1) {
    const only = withJob[0]
    return (
      <Link href={`/workspace/pricing/${only.job!.id}`} style={btnStyle}>
        {t.viewPricing}
      </Link>
    )
  }

  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen((v) => !v)} style={btnStyle}>
        {t.viewPricing}
        <span style={{ fontSize: 10 }}>▾</span>
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 50 }} />
          <div style={{
            position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 60,
            background: "white", border: "1px solid #E9E2F7", borderRadius: 10,
            boxShadow: "0 8px 28px rgba(124,99,200,0.18)",
            padding: 6, minWidth: 260, maxHeight: 320, overflowY: "auto",
          }}>
            <div style={{
              fontSize: 10, fontWeight: 700, color: "var(--nw-text-muted)",
              letterSpacing: "0.05em", fontFamily: "var(--nw-font-mono)", textTransform: "uppercase",
              padding: "6px 10px 4px",
            }}>
              {t.chooseMission}
            </div>
            {withJob.map((tg) => (
              <Link key={tg.job!.id} href={`/workspace/pricing/${tg.job!.id}`} style={{
                display: "block", fontSize: 12.5, color: "var(--nw-text-body)", fontWeight: 600,
                padding: "8px 10px", borderRadius: 7, textDecoration: "none",
              }}>
                {tg.job!.title}
                {tg.score != null && (
                  <span style={{ marginLeft: 6, fontSize: 11, color: "var(--nw-text-muted)" }}>· {tg.score}</span>
                )}
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/* Réf candidat — même valeur que celle imprimée dans le PDF anonymisé.
 * Permet au sourceur de retrouver instantanément qui est derrière une ref
 * quand le client en mentionne une au téléphone. */
function RefBadge({ candidateId, lang }: { candidateId: string; lang: Lang }) {
  const t = copy[lang]
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontSize: 10.5, fontWeight: 700, color: "var(--nw-primary)",
      letterSpacing: "0.04em",
      background: "rgba(124,99,200,0.08)",
      border: "1px solid rgba(124,99,200,0.22)",
      borderRadius: 7,
      padding: "2px 8px",
      fontFamily: "var(--nw-font-mono)",
    }}>
      {t.ref} · {candidateRefLabel(candidateId)}
    </span>
  )
}

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

type LoadedMatch = MatchAssessment & { job: Job | null }

interface MatchSummary {
  id: string
  job_id: string
  score: number | null
  match_tier: MatchTier | null
  pipeline_stage: PipelineStage
  in_pipeline: boolean
  job: { id: string; title: string } | null
}

/**
 * Fiche match — the post-refactor sourcer workspace, one URL per
 * (candidate × job) pair. Hosts the compose / anonymise / pricing-soon
 * actions in one place, with the match reason + mini pipeline on top.
 */
export default function MatchPage() {
  const { lang } = useLanguage()
  const t = copy[lang]
  const { matchId } = useParams<{ matchId: string }>()
  const router = useRouter()
  const sb = useMemo(() => getSupabase(), [])
  // Lecture seule : anonymisation, compose/envoi, pipeline et prétention
  // salariale sont bloqués côté serveur (requireActiveAccess). On grise l'UI.
  const { isReadOnly, organization } = useWorkspace()

  const [match, setMatch] = useState<LoadedMatch | null>(null)
  const [candidate, setCandidate] = useState<Candidate | null>(null)
  const [clientDirectory, setClientDirectory] = useState<OffLimitsClientRef[]>([])
  const [siblingMatches, setSiblingMatches] = useState<MatchSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [pipelineSaving, setPipelineSaving] = useState(false)
  // Prétention salariale du candidat (universelle, hors Suite Pricing).
  const [salaryExp, setSalaryExp] = useState("")
  const [salarySaving, setSalarySaving] = useState(false)
  // Retour client (segment cabinet/ESN) : motif libre + état de save.
  const [clientNote, setClientNote] = useState("")
  const [clientSaving, setClientSaving] = useState(false)

  // État d'anonymisation lifté ici : les contrôles du haut, l'aperçu vivant et
  // le panneau de réglages le partagent sans se voir entre eux.
  const [anonymizeStatus, setAnonymizeStatus] = useState<AnonymizeStatus>(INITIAL_ANONYMIZE_STATUS)
  const [anonymizeOptions, setAnonymizeOptions] = useState<AnonymizeOptions>(INITIAL_ANONYMIZE_OPTIONS)
  // Briques masquées dans le document remis au client POUR CETTE MISSION.
  // Distinct de l'édition de la fiche candidat, qui corrige la donnée elle-même.
  const [anonymizeSelection, setAnonymizeSelection] = useState<AnonymizeSelection>(EMPTY_SELECTION)
  const [anonymizeOrder, setAnonymizeOrder] = useState<AnonymizeOrder>(EMPTY_ORDER)
  const selectionQueue = useRef<Promise<unknown>>(Promise.resolve())

  // Contexte mission et marque, dans la forme exacte que le rendu serveur
  // reçoit — c'est ce qui permet à l'aperçu d'appeler le même modèle et donc
  // de montrer le même document. Le titre formel privilégie le `role_family`
  // normalisé, comme la route : « Ingénieur data / Data engineer » plutôt que
  // ce que le sourceur a tapé dans le formulaire.
  const anonymizeJobContext = useMemo<AnonymizedJobContext | null>(() => {
    const j = match?.job
    if (!j) return null
    const rf = j.normalized?.role_family ?? []
    return {
      title: rf.length > 0 ? rf.slice(0, 2).join(" / ") : j.title,
      seniority: j.seniority,
      location: j.location,
      required_skills: j.required_skills ?? [],
      nice_to_have_skills: j.nice_to_have_skills ?? [],
      must_have_skills: j.normalized?.must_have_skills ?? [],
      role_family: rf[0] ?? null,
    }
  }, [match?.job])

  const anonymizeBrand = useMemo<AnonymizedBrand | null>(() => {
    if (!organization) return null
    return {
      name: (organization.brand_name?.trim() || organization.name?.trim()) || null,
      // L'URL signée du logo est chargée par l'aperçu lui-même : elle ne vit
      // pas dans le contexte workspace et expire au bout d'une heure.
      logoUrl: null,
      color: organization.brand_color,
      colorSecondary: organization.brand_color_secondary,
      slogan: organization.brand_slogan,
      contactEmail: organization.contact_email,
    }
  }, [organization])
  const previewSectionRef = useRef<HTMLDivElement | null>(null)
  const scrollToPreview = () => {
    previewSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const res = await fetch(`/api/match/${matchId}`)
      if (!mounted) return
      if (res.status === 404) { setNotFound(true); setLoading(false); return }
      if (!res.ok) { setLoading(false); return }
      const data = await res.json()
      const loaded = data.match as LoadedMatch
      setMatch(loaded)
      setCandidate(data.candidate as Candidate)
      setAnonymizeSelection(readSelection((loaded as { anonymize_excluded?: unknown })?.anonymize_excluded))
      setAnonymizeOrder(readOrder((loaded as { anonymize_order?: unknown })?.anonymize_order))
      // Les options de la MISSION (résumé Nora, message) sont la source de
      // vérité éditoriale : la fiche match partait jusqu'ici des valeurs
      // d'usine et écrasait donc, à la génération, ce que le sourceur avait
      // réglé dans la shortlist. Invisible tant que l'aperçu n'existait pas,
      // criant maintenant qu'il montre le document.
      const jobOpts = loaded?.job?.anonymize_options
      if (jobOpts) {
        setAnonymizeOptions((prev) => ({
          ...prev,
          keepNoraSummary: jobOpts.keepNoraSummary ?? prev.keepNoraSummary,
          customText: jobOpts.customText ?? prev.customText,
        }))
      }
      setLoading(false)
    })()
    return () => { mounted = false }
  }, [matchId])

  // Annuaire clients (cabinet/ESN) pour l'alerte off-limits.
  const usesClients = organization ? orgUsesClients(organization.org_type) : false
  useEffect(() => {
    let mounted = true
    ;(async () => {
      if (!usesClients) { if (mounted) setClientDirectory([]); return }
      const { data } = await sb.from("clients").select("id, name, aliases, domain")
      if (mounted && data) setClientDirectory(data as OffLimitsClientRef[])
    })()
    return () => { mounted = false }
  }, [sb, usesClients])

  // Once we know who the candidate is, fetch all their matches so the
  // header dropdown can list every job they're paired with.
  useEffect(() => {
    if (!candidate) return
    let mounted = true
    ;(async () => {
      const { data } = await sb
        .from("match_assessments")
        .select("id, job_id, score, match_tier, pipeline_stage, in_pipeline, job:jobs(id, title)")
        .eq("candidate_id", candidate.id)
        .order("score", { ascending: false, nullsFirst: false })
      if (!mounted || !data) return
      setSiblingMatches(data as unknown as MatchSummary[])
    })()
    return () => { mounted = false }
  }, [candidate, sb])

  // Fetch existing anonymised PDF URL on mount (if there is one) so the
  // preview shows up immediately when the sourceur opens the page.
  useEffect(() => {
    if (!candidate) return
    let cancelled = false
    ;(async () => {
      const res = await fetch(`/api/cv/${candidate.id}/anonymize`)
      if (cancelled || !res.ok) return
      const j = await res.json().catch(() => ({}))
      const preview = j?.preview_url ?? j?.url ?? null
      const download = j?.download_url ?? j?.url ?? null
      if (preview) {
        setAnonymizeStatus({
          state: "ready",
          previewUrl: preview,
          downloadUrl: download,
          error: null,
        })
      }
    })()
    return () => { cancelled = true }
  }, [candidate])

  /**
   * Enregistre la sélection de briques. Les écritures sont CHAÎNÉES : chaque
   * PATCH envoie l'état complet, donc deux réponses arrivées dans le désordre
   * feraient réapparaître chez le client une brique qu'on venait de masquer.
   * Une file d'un seul rang suffit — on ne clique pas ces boutons en rafale.
   */
  const saveSelection = (next: AnonymizeSelection) => {
    if (isReadOnly) return
    setAnonymizeSelection(next)
    const run = async () => {
      try {
        await fetch(`/api/match/${matchId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ anonymize_excluded: next }),
        })
      } catch { /* best-effort : la sélection reste à l'écran, un clic la rejoue */ }
    }
    selectionQueue.current = selectionQueue.current.then(run)
  }

  /** Ordre des briques — même file d'écriture, même raison : chaque PATCH
   *  envoie la liste complète, deux réponses désordonnées remettraient un
   *  ordre périmé. */
  const saveOrder = (next: AnonymizeOrder) => {
    if (isReadOnly) return
    setAnonymizeOrder(next)
    const run = async () => {
      try {
        await fetch(`/api/match/${matchId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ anonymize_order: next }),
        })
      } catch { /* best-effort */ }
    }
    selectionQueue.current = selectionQueue.current.then(run)
  }

  /** Renomme la MISSION. Portée volontairement large — c'est son nom, il
   *  change partout où elle apparaît, pas seulement sur ce document. */
  const saveJobTitle = (title: string) => {
    const jobId = match?.job?.id
    if (!jobId || isReadOnly) return
    setMatch((prev) => prev?.job ? { ...prev, job: { ...prev.job, title } } : prev)
    void fetch(`/api/jobs/${jobId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    }).catch(() => { /* best-effort : la valeur reste à l'écran */ })
  }

  /**
   * Le résumé Nora et le message d'accompagnement appartiennent à la MISSION
   * (`jobs.anonymize_options`) : c'est là que la shortlist les lit et les
   * écrit. Les régler ici sans les réenregistrer donnerait un message qui
   * disparaît dès qu'on quitte la page, et qui contredirait la shortlist.
   *
   * Le gabarit et le filigrane, eux, restent LOCAUX à cette génération : ils
   * appartiennent à l'organisation et se règlent depuis la shortlist, où le
   * geste est explicite. Les réécrire au passage depuis une fiche candidat
   * changerait la présentation de tous les documents du cabinet sans que
   * personne ne l'ait demandé.
   */
  const jobOptionsTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const jobOptionsReady = useRef(false)
  useEffect(() => {
    const jobId = match?.job?.id
    if (!jobId || isReadOnly) return
    // Le premier passage suit le chargement : rien à réécrire.
    if (!jobOptionsReady.current) { jobOptionsReady.current = true; return }
    if (jobOptionsTimer.current) clearTimeout(jobOptionsTimer.current)
    jobOptionsTimer.current = setTimeout(() => {
      void fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          anonymize_options: {
            keepNoraSummary: anonymizeOptions.keepNoraSummary,
            customText: anonymizeOptions.customText,
          },
        }),
      }).catch(() => { /* best-effort : la valeur reste à l'écran */ })
    }, 700)
    return () => { if (jobOptionsTimer.current) clearTimeout(jobOptionsTimer.current) }
    // Volontairement limité aux deux champs de la mission.
  }, [anonymizeOptions.keepNoraSummary, anonymizeOptions.customText, match?.job?.id, isReadOnly])

  const generateAnonymized = async () => {
    if (!candidate || anonymizeStatus.state === "working" || isReadOnly) return
    setAnonymizeStatus((prev) => ({ ...prev, state: "working", error: null }))
    try {
      const res = await fetch(`/api/cv/${candidate.id}/anonymize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: match?.job?.id ?? null,
          options: {
            template: anonymizeOptions.template,
            keep_nora_summary: anonymizeOptions.keepNoraSummary,
            keep_candidate_summary: anonymizeOptions.keepCandidateSummary,
            custom_text: anonymizeOptions.customText.trim() || null,
            watermark: anonymizeOptions.watermark,
          },
        }),
      })
      const rawText = await res.text()
      if (!rawText) {
        setAnonymizeStatus({
          state: "error",
          previewUrl: null,
          downloadUrl: null,
          error: t.emptyServerResponse(res.status),
        })
        return
      }
      let data: { ok?: boolean; preview_url?: string; download_url?: string; url?: string; message?: string; error?: string }
      try {
        data = JSON.parse(rawText)
      } catch {
        setAnonymizeStatus({
          state: "error",
          previewUrl: null,
          downloadUrl: null,
          error: t.unreadableServerResponse,
        })
        return
      }
      if (!res.ok || !data.ok) {
        setAnonymizeStatus({
          state: "error",
          previewUrl: null,
          downloadUrl: null,
          error: data.message ?? data.error ?? t.anonymizeFailed,
        })
        return
      }
      setAnonymizeStatus({
        state: "ready",
        previewUrl: data.preview_url ?? data.url ?? null,
        downloadUrl: data.download_url ?? data.url ?? null,
        error: null,
      })
      // Scroll vers la preview dès que le serveur a renvoyé l'URL.
      // L'iframe charge en différé mais la carte est déjà visible.
      setTimeout(scrollToPreview, 120)
    } catch (err) {
      setAnonymizeStatus({
        state: "error",
        previewUrl: null,
        downloadUrl: null,
        error: (err as Error).message ?? t.networkError,
      })
    }
  }


  // Synchronise le champ prétention au (re)chargement du match uniquement
  // (pas à chaque update local, pour ne pas écraser la saisie en cours).
  useEffect(() => {
    setSalaryExp(match?.salary_expectation_brut != null ? String(match.salary_expectation_brut) : "")
    setClientNote(match?.client_feedback_note ?? "")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match?.id])

  if (loading) {
    return <DetailSkeleton label={t.loadingMatch} />
  }
  if (notFound || !match || !candidate) {
    return (
      <div style={{ padding: "60px 24px", textAlign: "center", color: "var(--nw-text-muted)" }}>
        <p style={{ fontSize: 16, fontWeight: 600 }}>{t.matchNotFound}</p>
        <Link href="/workspace/pipeline" style={{ color: "var(--nw-primary)", textDecoration: "none", fontSize: 14 }}>
          {t.backToPipeline}
        </Link>
      </div>
    )
  }

  const job = match.job
  const cv = candidate.parsed_cv ?? null

  // Ajoute / retire ce candidat de la pipeline (liste curatée). Optimiste.
  const togglePipeline = async () => {
    if (isReadOnly) return
    const next = !match.in_pipeline
    setPipelineSaving(true)
    setMatch((prev) => prev ? { ...prev, in_pipeline: next } : prev)
    const res = await fetch(`/api/match/${match.id}/pipeline`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ in_pipeline: next }),
    })
    if (!res.ok) setMatch((prev) => prev ? { ...prev, in_pipeline: !next } : prev)
    setPipelineSaving(false)
  }

  // Sauvegarde la prétention salariale du candidat (universel). No-op si
  // inchangé. Persisté sur match_assessments, comparé au salaire cible du poste.
  const saveSalaryExpectation = async () => {
    if (isReadOnly) return
    const raw = salaryExp.trim()
    const val: number | null = raw === "" ? null : Math.round(Number(raw))
    if (raw !== "" && (val == null || !Number.isFinite(val) || val < 0)) return
    if ((match.salary_expectation_brut ?? null) === val) return
    setSalarySaving(true)
    const res = await fetch(`/api/match/${match.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ salary_expectation_brut: val }),
    })
    setSalarySaving(false)
    if (res.ok) setMatch((prev) => prev ? { ...prev, salary_expectation_brut: val } : prev)
  }

  // Sauvegarde le motif / retour libre du client. No-op si inchangé.
  const saveClientNote = async () => {
    if (isReadOnly) return
    const val = clientNote.trim() === "" ? null : clientNote.trim()
    if ((match.client_feedback_note ?? null) === val) return
    setClientSaving(true)
    const res = await fetch(`/api/match/${match.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_feedback_note: val }),
    })
    setClientSaving(false)
    if (res.ok) {
      const data = await res.json().catch(() => null)
      setMatch((prev) => prev ? { ...prev, client_feedback_note: val, client_feedback_at: data?.match?.client_feedback_at ?? prev.client_feedback_at } : prev)
    }
  }

  // Client rattaché à la mission (cabinet/ESN). Affiché seulement si l'org
  // utilise les clients ET que la mission en a un.
  const missionClient = usesClients && job?.client_id
    ? clientDirectory.find((c) => c.id === job.client_id) ?? null
    : null

  const tier = match.match_tier ? t.tierMeta[match.match_tier] : null
  // PR-Z : critères flexibles. Pour les anciens matchs (avant PR-Z), on
  // retombe sur score_dimensions pour ne pas perdre l'info.
  const jobCriteria = ((job?.criteria ?? []) as Criterion[])
  const mainCriteria = jobCriteria.filter((c) => c.weight === "main")
  const bonusCriteria = jobCriteria.filter((c) => c.weight === "bonus")
  const evalById = new Map((match.criteria_eval ?? []).map((e) => [e.id, e as CriterionEval]))
  const hasCriteriaEval = mainCriteria.length > 0 && (match.criteria_eval ?? []).length > 0
  const dims = match.score_dimensions ?? {}
  const dimEntries = Object.entries(dims).filter(([, v]) => typeof v === "number") as [keyof ScoreDimensions, number][]
  const isManual = match.score == null

  const offLimits = (() => {
    if (clientDirectory.length === 0) return null
    const res = detectOffLimitsForCandidate(candidate.parsed_cv, candidate.current_company, clientDirectory)
    return res.verdict === "none" || !res.client
      ? null
      : { verdict: res.verdict, clientName: res.client.name }
  })()

  return (
    <main style={{
      padding: "32px 24px 80px",
      maxWidth: 1440, margin: "0 auto",
      fontFamily: "var(--font-inter), sans-serif",
    }}>
      <div style={{ marginBottom: 18, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, fontSize: 12.5 }}>
        {/* Gauche : retour à la mission (origine du candidat) */}
        {job ? (
          <Link href={`/workspace/missions/${job.id}`} style={{ color: "var(--nw-primary)", textDecoration: "none" }}>
            {t.missionPrefix(job.title)}
          </Link>
        ) : <span />}
        {/* Droite : avancer vers la pipeline (sens de progression du workspace) */}
        <Link href="/workspace/pipeline" style={{ color: "var(--nw-primary)", textDecoration: "none" }}>
          {t.pipelineArrow}
        </Link>
      </div>

      {offLimits && (
        <div
          role="alert"
          style={{
            marginBottom: 14, padding: "12px 16px", borderRadius: 12,
            display: "flex", alignItems: "flex-start", gap: 11,
            color: offLimits.verdict === "confirmed" ? "#912018" : "#93370D",
            background: offLimits.verdict === "confirmed" ? "rgba(217,45,32,0.07)" : "rgba(245,158,11,0.09)",
            border: `1px solid ${offLimits.verdict === "confirmed" ? "rgba(217,45,32,0.28)" : "rgba(245,158,11,0.32)"}`,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 16 16" style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true">
            <path d="M8 1.5L15 14H1L8 1.5Z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
            <path d="M8 6.2v3.2M8 11.4h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <div style={{ fontSize: 13, lineHeight: 1.5 }}>
            <strong style={{ fontWeight: 800 }}>
              {offLimits.verdict === "confirmed"
                ? (lang === "fr" ? "Off-limits — conflit d'intérêt" : "Off-limits — conflict of interest")
                : (lang === "fr" ? "Conflit possible — à vérifier" : "Possible conflict — to verify")}
            </strong>
            <span style={{ display: "block", marginTop: 2 }}>
              {lang === "fr"
                ? `Ce candidat est actuellement en poste chez ${offLimits.clientName}, un de vos clients. Le présenter à un autre client peut poser un problème d'off-limits.`
                : `This candidate currently works at ${offLimits.clientName}, one of your clients. Presenting them to another client may raise an off-limits issue.`}
            </span>
          </div>
        </div>
      )}

      {/* Header band — one fiche match per candidate. The job picker
          replaces the static title: switching jobs navigates to the
          corresponding matchId, page re-renders with the right content. */}
      <m.section
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: EASE }}
        style={{
          background: "white", borderRadius: 16, border: "1px solid var(--nw-border-soft)",
          padding: "18px 22px", marginBottom: 14,
          display: "grid", gridTemplateColumns: "1fr auto", gap: 14, alignItems: "center",
        }}
        className="match-band"
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <h1 style={{
              margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", color: "var(--nw-text)",
            }}>
              {candidate.full_name ?? t.noNameCandidate}
              <span style={{ fontWeight: 500, color: "var(--nw-text-muted)", fontSize: 15 }}>{t.forSuffix}</span>
            </h1>
            <RefBadge candidateId={candidate.id} lang={lang} />
            <div style={{ minWidth: 280, maxWidth: 420 }}>
              <Select
                value={match.id}
                onChange={(nextId) => router.push(`/workspace/match/${nextId}`)}
                options={siblingMatches.length > 0
                  ? siblingMatches.map((m) => ({
                      value: m.id,
                      label: m.job?.title ?? t.noMission,
                      hint: m.score != null
                        ? `${m.score} · ${m.match_tier ?? ""}`.trim()
                        : t.manual,
                    }))
                  : [{ value: match.id, label: job?.title ?? t.noMission }]
                }
              />
            </div>
          </div>
          <div style={{ marginTop: 8, fontSize: 12.5, color: "var(--nw-text-muted)", display: "flex", gap: 10, flexWrap: "wrap" }}>
            {candidate.current_title && <span>{candidate.current_title}</span>}
            {candidate.location && <span>· {candidate.location}</span>}
            {candidate.seniority_level && <span>· {candidate.seniority_level}</span>}
            {job?.location && <span>· {job.location}</span>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
          {/* Action principale : suivre dans la pipeline */}
          <button
            onClick={togglePipeline}
            disabled={pipelineSaving || isReadOnly}
            title={isReadOnly ? t.readOnlyPipeline : (match.in_pipeline ? t.removeFromPipeline : t.followInPipeline)}
            style={{
              fontSize: 13, fontWeight: 700, fontFamily: "inherit",
              cursor: (pipelineSaving || isReadOnly) ? "not-allowed" : "pointer",
              borderRadius: 10, padding: "9px 16px",
              ...(isReadOnly
                ? { color: "#B8AEDE", background: "#F3F0FA", border: "1px solid #E5E0F0" }
                : match.in_pipeline
                ? { color: "var(--nw-success)", background: "rgba(34,197,94,0.10)", border: "1px solid rgba(34,197,94,0.35)" }
                : { color: "white", background: "var(--nw-primary)", border: "none", boxShadow: "0 6px 18px -8px rgba(124,99,200,0.6)" }),
            }}
          >
            {match.in_pipeline ? t.inPipeline : t.addToPipeline}
          </button>
          {isManual ? (
            <span style={{
              fontSize: 12, fontWeight: 700, color: "var(--nw-primary)",
              background: "rgba(124,99,200,0.08)",
              border: "1px solid rgba(124,99,200,0.22)",
              borderRadius: 10, padding: "8px 12px",
            }}>
              {t.manuallyAssigned}
            </span>
          ) : tier && (
            <span style={{
              fontSize: 14, fontWeight: 800, color: tier.fg,
              background: tier.bg, border: `1px solid ${tier.bd}`,
              borderRadius: 10, padding: "8px 14px",
            }}>
              {match.score} · {tier.label}
            </span>
          )}
          {/* Raccourci pricing — si ce match est en pipeline, on permet
              d'ouvrir directement la fiche pricing de la mission. Si le
              candidat est dans la pipeline sur plusieurs missions, on
              propose un mini-dropdown. */}
          {(() => {
            const pipelineSiblings = siblingMatches.filter((m) => m.in_pipeline && m.job?.id)
            if (pipelineSiblings.length === 0 && !match.in_pipeline) return null
            const targets = pipelineSiblings.length > 0
              ? pipelineSiblings
              : [{ id: match.id, job: job ? { id: job.id, title: job.title } : null, score: match.score, match_tier: match.match_tier, in_pipeline: true }]
            return <PricingShortcut targets={targets} lang={lang} />
          })()}
          <Link href={`/workspace/vivier/${candidate.id}`} style={{
            fontSize: 12, fontWeight: 700, color: "var(--nw-primary)",
            background: "white", border: "1px solid rgba(124,99,200,0.25)",
            borderRadius: 9, padding: "8px 12px", textDecoration: "none",
          }}>
            {t.candidateSheet}
          </Link>
        </div>
      </m.section>

      {/* Anonymisation déplacée en bas de fiche (personnaliser + générer +
          télécharger tout au même endroit, discret). Bouton d'accès rapide. */}
      {candidate.parse_status === "parsed" && !isReadOnly && (
        <button
          type="button"
          onClick={scrollToPreview}
          style={{
            display: "inline-flex", alignItems: "center", gap: 8, alignSelf: "flex-start",
            fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, color: "var(--nw-primary)",
            background: "white", border: "1px solid rgba(124,99,200,0.25)", borderRadius: 9,
            padding: "8px 13px", cursor: "pointer",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
          </svg>
          {t.anonymizeJump}
        </button>
      )}

      {/* Three-column layout:
         - left : résumé candidat, pourquoi ça matche, CV anonymisé
         - mid  : message d'approche, conversation placeholder
         - right: vertical kanban — view of where this candidate sits
                  across ALL their matched jobs (not the same role as the
                  header dropdown: dropdown switches focus, kanban gives
                  context "où en est-il ailleurs ?"). */}
      <div className="match-grid" style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr) 240px",
        gap: 18,
        alignItems: "stretch",
      }}>
        {/* COL 1 (rangée 1) — pourquoi ça matche + résumé candidat */}
        <div style={{ gridColumn: "1", gridRow: "1", display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Match reason — featured, en premier : info de décision n°1 */}
          {!isManual && (hasCriteriaEval || dimEntries.length > 0) && (
            <section style={{
              background: "white",
              border: "1px solid var(--nw-border-soft)",
              borderRadius: 16,
              padding: 16,
            }}>
              <h3 style={{
                margin: 0, fontSize: 11, fontWeight: 800, color: "var(--nw-success)",
                letterSpacing: "0.06em", fontFamily: "var(--nw-font-mono)", textTransform: "uppercase",
              }}>
                {t.criteriaTitle}
              </h3>

              {/* PR-Z : critères flexibles. Affiche main + bonus séparément. */}
              {hasCriteriaEval ? (
                <>
                  <div style={{ marginTop: 10 }}>
                    <p style={{ margin: "0 0 6px", fontSize: 10, fontWeight: 700, color: "var(--nw-text-muted)", letterSpacing: "0.05em", fontFamily: "var(--nw-font-mono)", textTransform: "uppercase" }}>
                      {t.mainLabel}
                    </p>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 6 }}>
                      {mainCriteria.map((crit) => (
                        <CriteriaEvalLine key={crit.id} criterion={crit} ev={evalById.get(crit.id)} lang={lang} />
                      ))}
                    </div>
                  </div>
                  {bonusCriteria.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <p style={{ margin: "0 0 6px", fontSize: 10, fontWeight: 700, color: "var(--nw-text-muted)", letterSpacing: "0.05em", fontFamily: "var(--nw-font-mono)", textTransform: "uppercase" }}>
                        {t.bonusLabel}
                      </p>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 6 }}>
                        {bonusCriteria.map((crit) => (
                          <CriteriaEvalLine key={crit.id} criterion={crit} ev={evalById.get(crit.id)} lang={lang} />
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                /* Fallback legacy — matchs scorés avant PR-Z. */
                dimEntries.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 10 }}>
                    {dimEntries.map(([k, v]) => (
                      <span key={k} style={{ fontSize: 11, color: "var(--nw-success)", fontWeight: 700 }}>
                        {t.scoreDimLabels[k] ?? k} <strong style={{ fontSize: 14 }}>{v}</strong>
                      </span>
                    ))}
                  </div>
                )
              )}

              {match.justification && (
                <p style={{ margin: "12px 0 0", fontSize: 12.5, color: "var(--nw-text-body)", lineHeight: 1.55, fontStyle: "italic" }}>
                  &ldquo;{match.justification}&rdquo;
                </p>
              )}
            </section>
          )}
          {isManual && (
            <section style={{
              background: "rgba(124,99,200,0.06)",
              border: "1px solid rgba(124,99,200,0.22)",
              borderRadius: 16, padding: 16,
            }}>
              <h3 style={{ margin: "0 0 6px", fontSize: 11, fontWeight: 800, color: "var(--nw-primary)", letterSpacing: "0.06em", fontFamily: "var(--nw-font-mono)", textTransform: "uppercase" }}>
                {t.manualAssignmentTitle}
              </h3>
              <p style={{ margin: 0, fontSize: 12.5, color: "var(--nw-text-body)", lineHeight: 1.55 }}>
                {match.justification ?? t.manualAssignmentBody}
              </p>
            </section>
          )}

          {/* Prétention salariale du candidat — universelle (hors Suite
              Pricing). Comparée au salaire cible du poste si renseigné, et
              réutilisable dans le pricing ensuite. */}
          <section style={{ background: "white", border: "1px solid var(--nw-border-soft)", borderRadius: 16, padding: 16 }}>
            <h3 style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 700, color: "var(--nw-text-muted)", letterSpacing: "0.08em", fontFamily: "var(--nw-font-mono)", textTransform: "uppercase" }}>
              {t.salaryExpectationTitle}
            </h3>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <input
                type="number" min={0} value={salaryExp}
                onChange={(e) => setSalaryExp(e.target.value)}
                onBlur={saveSalaryExpectation}
                readOnly={isReadOnly}
                disabled={isReadOnly}
                placeholder={t.salaryPlaceholder}
                title={isReadOnly ? t.readOnlyLabel : undefined}
                style={{ width: 150, padding: "9px 12px", fontSize: 13.5, borderRadius: 9, border: "1px solid var(--nw-primary-100)", outline: "none", fontFamily: "inherit", background: isReadOnly ? "#F3F0FA" : "white", cursor: isReadOnly ? "not-allowed" : "text" }}
              />
              <span style={{ fontSize: 12, color: "var(--nw-text-muted)" }}>{t.grossPerYear(salarySaving)}</span>
            </div>
            {(() => {
              const target = match.job?.target_gross_salary ?? null
              const ask = match.salary_expectation_brut ?? null
              const locale = lang === "fr" ? "fr-FR" : "en-US"
              if (target == null) {
                return <p style={{ margin: "10px 0 0", fontSize: 11.5, color: "var(--nw-text-muted)" }}>{t.fillTargetSalary}</p>
              }
              if (ask == null) {
                return <p style={{ margin: "10px 0 0", fontSize: 12, color: "var(--nw-text-muted)" }}>{t.targetSalaryOnly(target.toLocaleString(locale))}</p>
              }
              const diff = ask - target
              const pct = target > 0 ? Math.round((diff / target) * 100) : 0
              const over = diff > 0
              const col = over
                ? { fg: "var(--nw-warn)", bg: "rgba(245,158,11,0.10)", bd: "rgba(245,158,11,0.28)" }
                : { fg: "var(--nw-success)", bg: "rgba(34,197,94,0.10)", bd: "rgba(34,197,94,0.28)" }
              return (
                <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12, color: "var(--nw-text-muted)" }}>{t.targetSalaryLabel}<strong>{target.toLocaleString(locale)} €</strong></span>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: col.fg, background: col.bg, border: `1px solid ${col.bd}`, borderRadius: 99, padding: "2px 10px" }}>
                    {over ? t.aboveBudget : diff === 0 ? t.inBudget : t.underBudget}{diff !== 0 ? ` · ${over ? "+" : ""}${pct}%` : ""}
                  </span>
                </div>
              )
            })()}
          </section>

          {/* Retour client (segment cabinet/ESN) — visible seulement si la
              mission est rattachée à un client. Dimension orthogonale au
              pipeline interne : que dit le client une fois le candidat
              présenté ? Privé, aucun message n'est envoyé. */}
          {missionClient && (
            <section style={{ background: "white", border: "1px solid var(--nw-border-soft)", borderRadius: 16, padding: 16 }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
                <h3 style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "var(--nw-text-muted)", letterSpacing: "0.08em", fontFamily: "var(--nw-font-mono)", textTransform: "uppercase" }}>
                  {t.clientFeedbackTitle}
                </h3>
                <span style={{ fontSize: 11.5, color: "var(--nw-primary)", fontWeight: 600 }}>
                  {t.clientFeedbackFor(missionClient.name)}
                </span>
              </div>
              <p style={{ margin: "0 0 10px", fontSize: 11.5, color: "var(--nw-text-muted)", lineHeight: 1.5 }}>
                {t.clientFeedbackHint}
              </p>
              <textarea
                value={clientNote}
                onChange={(e) => setClientNote(e.target.value)}
                onBlur={saveClientNote}
                readOnly={isReadOnly}
                disabled={isReadOnly}
                placeholder={t.clientNotePlaceholder}
                rows={3}
                style={{
                  width: "100%", padding: "9px 12px", fontSize: 13,
                  borderRadius: 9, border: "1px solid var(--nw-primary-100)", outline: "none",
                  fontFamily: "inherit", resize: "vertical", boxSizing: "border-box",
                  background: isReadOnly ? "#F3F0FA" : "white", cursor: isReadOnly ? "not-allowed" : "text",
                }}
              />
              <span style={{ display: "block", marginTop: 6, fontSize: 11, color: "var(--nw-text-muted)" }}>
                {clientSaving
                  ? t.clientNoteSaving
                  : match.client_feedback_at
                    ? t.clientFeedbackAtLabel(new Date(match.client_feedback_at).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US"))
                    : ""}
              </span>
            </section>
          )}

          <section style={{ flex: 1, background: "white", border: "1px solid var(--nw-border-soft)", borderRadius: 16, padding: 18 }}>
            <h3 style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 700, color: "var(--nw-text-muted)", letterSpacing: "0.08em", fontFamily: "var(--nw-font-mono)", textTransform: "uppercase" }}>
              {t.candidateSummaryTitle}
            </h3>
            {cv?.summary && (
              <p style={{ margin: "0 0 10px", fontSize: 13.5, color: "var(--nw-text-body)", lineHeight: 1.65 }}>
                {cv.summary}
              </p>
            )}
            {candidate.skills && candidate.skills.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                {candidate.skills.slice(0, 12).map((s) => (
                  <span key={s} style={{
                    fontSize: 11.5, color: "var(--nw-text-secondary)",
                    background: "var(--nw-bg)", border: "1px solid var(--nw-border-soft)",
                    padding: "3px 9px", borderRadius: 6,
                  }}>{s}</span>
                ))}
              </div>
            )}

            {/* Méta : années d'XP + langues */}
            {(cv?.years_experience != null || (cv?.languages?.length ?? 0) > 0) && (
              <div style={{
                display: "flex", flexWrap: "wrap", gap: 16, marginTop: 14,
                fontSize: 12, color: "var(--nw-text-muted)",
              }}>
                {cv?.years_experience != null && (
                  <span>📈 <strong style={{ color: "var(--nw-text-body)" }}>{t.yearsExp(cv.years_experience)}</strong> {t.experienceSuffix}</span>
                )}
                {(cv?.languages?.length ?? 0) > 0 && (
                  <span>🌐 {cv!.languages!.join(", ")}</span>
                )}
              </div>
            )}

            {/* Parcours — remplit la carte avec du concret plutôt que du vide */}
            {(cv?.experience?.length ?? 0) > 0 && (
              <div style={{ marginTop: 16 }}>
                <p style={{ margin: "0 0 10px", fontSize: 11, fontWeight: 700, color: "var(--nw-text-muted)", letterSpacing: "0.06em", fontFamily: "var(--nw-font-mono)", textTransform: "uppercase" }}>
                  {t.pathTitle}
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {cv!.experience!.slice(0, 6).map((xp, i) => {
                    const end = xp.end === null ? t.present : (xp.end ?? "")
                    const period = [xp.start ?? "", end].filter(Boolean).join(" – ")
                    return (
                      <div key={i} style={{ display: "flex", gap: 10 }}>
                        <span style={{
                          flexShrink: 0, width: 7, height: 7, borderRadius: "50%",
                          background: "var(--nw-primary-200)", marginTop: 5,
                        }} />
                        <div style={{ minWidth: 0 }}>
                          <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: "var(--nw-text-body)", lineHeight: 1.4 }}>
                            {xp.title}{xp.company ? <span style={{ fontWeight: 400, color: "var(--nw-text-muted)" }}> · {xp.company}</span> : null}
                          </p>
                          {period && (
                            <p style={{ margin: "1px 0 0", fontSize: 11, color: "var(--nw-text-muted)" }}>{period}</p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </section>
        </div>

        {/* COL 2 (rangée 1) — message d'approche */}
        <div style={{ gridColumn: "2", gridRow: "1", display: "flex", flexDirection: "column", gap: 14 }}>
          <section style={{ flex: 1, background: "white", border: "1px solid var(--nw-border-soft)", borderRadius: 16, padding: 18 }}>
            <h3 style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 700, color: "var(--nw-text-muted)", letterSpacing: "0.08em", fontFamily: "var(--nw-font-mono)", textTransform: "uppercase" }}>
              {t.approachMessageTitle}
            </h3>
            {isReadOnly ? (
              <p style={{ margin: 0, fontSize: 13, color: "var(--nw-text-muted)" }}>
                Lecture seule — la rédaction de messages est indisponible. Souscrivez pour reprendre la main.
              </p>
            ) : candidate.parse_status === "parsed" ? (
              <ComposeBox
                candidate={candidate}
                selectedJobId={job?.id ?? ""}
                jobTitle={job?.title ?? null}
                showJobBadge={false}
              />
            ) : (
              <p style={{ margin: 0, fontSize: 13, color: "var(--nw-text-muted)" }}>
                {t.availableOnceParsed}
              </p>
            )}
          </section>

        </div>

        {/* COL 3 (rangée 1) — mini-kanban vertical, collant.
            DEUX niveaux, et c'est nécessaire : pour un enfant direct de
            grille, `position: sticky` se confine au CONTENEUR DE GRILLE, pas à
            la cellule. Le rail glissait donc sur toute la hauteur de la fiche
            et venait se poser par-dessus l'atelier de la rangée 2. En le
            plaçant dans une cellule qui, elle, s'arrête au bas de la rangée 1,
            sa course s'arrête avec elle. */}
        <aside className="match-rail" style={{ gridColumn: "3", gridRow: "1", alignSelf: "stretch" }}>
          <div style={{ position: "sticky", top: 80 }}>
            <CandidateMiniKanban
              candidateId={candidate.id}
              candidateName={candidate.full_name}
              highlightMatchId={match.id}
              layout="vertical"
              onlyMatchId={match.id}
              readOnly={isReadOnly}
            />
          </div>
        </aside>

        {/* RANGÉE 2 — l'atelier du document client.
            À gauche l'aperçu vivant : le sourceur agit sur les blocs
            eux-mêmes. À droite les réglages de page. Le PDF réellement
            généré reste consultable en dessous — c'est la pièce qui part,
            l'aperçu n'en est que le plan de travail. */}
        {/* L'atelier prend TOUTE la largeur : sur deux colonnes sur trois, il
            laissait une colonne vide à droite, le document se retrouvait
            décentré, et le rail du pipeline restait planté à côté de lui. */}
        <div id="anonymize" ref={previewSectionRef} className="match-cv" style={{ gridColumn: "1 / -1", gridRow: "2", display: "flex", flexDirection: "column", gap: 16, scrollMarginTop: 80 }}>
          <AnonymizeControls
            candidateId={candidate.id}
            jobId={job?.id ?? null}
            jobTitle={job?.title ?? null}
            candidateParsed={candidate.parse_status === "parsed"}
            status={anonymizeStatus}
            options={anonymizeOptions}
            onOptionsChange={setAnonymizeOptions}
            onGenerate={generateAnonymized}
            readOnly={isReadOnly}
            // Les réglages vivent dans la colonne de droite de l'atelier.
            showCustomize={candidate.parse_status !== "parsed"}
          />

          {candidate.parse_status === "parsed" ? (
            <div className="anon-studio">
              <AnonymizedCvLivePreview
                candidate={candidate}
                // Le PDF imprime le SLUG (« 0AAAAB50 »), pas le libellé « C-… » :
                // l'aperçu doit afficher exactement la même référence.
                reference={candidateRefSlug(candidate.id)}
                job={anonymizeJobContext}
                brand={anonymizeBrand}
                options={anonymizeOptions}
                selection={anonymizeSelection}
                onSelectionChange={saveSelection}
                order={anonymizeOrder}
                onOrderChange={saveOrder}
                onCvChange={(cv, taxonomy) => setCandidate((prev) => prev
                  ? { ...prev, parsed_cv: cv, ...(taxonomy ? { taxonomy } : {}) }
                  : prev)}
                // Le NOM de la mission, distinct du titre imprimé sur le
                // document (`anonymizeJobContext.title` = la famille de
                // métier). Le panneau de renommage doit partir du nom réel.
                jobTitle={match?.job?.title ?? null}
                onJobTitleChange={saveJobTitle}
                readOnly={isReadOnly}
              />
              {/* Les réglages SUIVENT le défilement.
                  Un CV fait deux à quatre écrans de haut ; sans ça, changer de
                  gabarit ou décocher le résumé imposait de remonter tout en
                  haut, de régler à l'aveugle, puis de redescendre pour voir
                  l'effet. Le même piège de grille que pour le rail du
                  pipeline : une cellule qui s'étire, et le collage à
                  l'intérieur. */}
              <div className="anon-rail">
                <div>
                  <AnonymizeSidePanel
                    options={anonymizeOptions}
                    onChange={setAnonymizeOptions}
                    readOnly={isReadOnly}
                    footer={
                      <button
                        type="button"
                        onClick={() => void generateAnonymized()}
                        disabled={isReadOnly || anonymizeStatus.state === "working"}
                        style={{
                          fontFamily: "inherit", fontSize: 12.5, fontWeight: 700,
                          color: "white", background: "var(--nw-primary)",
                          border: "1px solid rgba(124,99,200,0.4)", borderRadius: 10,
                          padding: "10px 14px",
                          cursor: isReadOnly || anonymizeStatus.state === "working" ? "not-allowed" : "pointer",
                          opacity: isReadOnly || anonymizeStatus.state === "working" ? 0.55 : 1,
                        }}
                      >
                        {anonymizeStatus.state === "working" ? t.generating : t.generateDocument}
                      </button>
                    }
                  />
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <style>{`
        .anon-studio {
          display: grid;
          gap: 16px;
          /* 794px = largeur d'une A4 à 96 dpi. La page garde sa taille réelle
             et l'ensemble page + réglages est CENTRÉ dans la fiche : c'est un
             document qu'on regarde, pas un panneau qui remplit l'espace. */
          /* 794 px de page + 2 x 22 px de fond autour = 838 : sans ces 44 px,
             la contrainte de largeur maximale rabotait la page à 749 et le
             format n'était plus celui de l'A4. */
          grid-template-columns: minmax(0, 838px) minmax(240px, 300px);
          justify-content: center;
          align-items: start;
        }
        /* La cellule des réglages s'étire sur toute la hauteur de l'atelier ;
           le panneau colle à l'intérieur et s'arrête donc avec l'aperçu, sans
           aller se poser sur ce qui suit. Même construction que le rail du
           pipeline, pour la même raison : un enfant direct de grille en
           position collante se confine au CONTENEUR, pas à sa cellule. */
        .anon-rail { align-self: stretch; }
        .anon-rail > div {
          position: sticky;
          top: 80px;
          /* Le panneau est plus haut que l'écran sur un portable : sans cette
             borne, son bas — le bouton « Générer » — restait hors de vue. */
          max-height: calc(100vh - 104px);
          overflow-y: auto;
        }
        @media (max-width: 1180px) {
          /* Sous cette largeur la page ne tient plus à sa taille réelle : on
             la laisse se réduire plutôt que d'imposer un défilement latéral. */
          .anon-studio { grid-template-columns: minmax(0, 1fr) minmax(240px, 280px); }
        }
        @media (max-width: 1180px) {
          .match-band { grid-template-columns: 1fr !important; }
          .match-grid { grid-template-columns: 1fr !important; }
          /* En mono-colonne, on remet tout en flux automatique sinon les
             placements explicites (col 2/3, row 2, span) cassent l'empilement. */
          .match-grid > * { grid-column: 1 / -1 !important; grid-row: auto !important; }
          .match-rail { position: static !important; }
        }
        @media (max-width: 900px) {
          /* Les réglages passent SOUS l'aperçu : sur écran étroit, une
             colonne de 260px écraserait le document au point de le rendre
             illisible, et c'est lui qu'on vient regarder. */
          .anon-studio { grid-template-columns: 1fr !important; }
          /* Empilés, les réglages n'ont plus rien à suivre : les coller
             immobiliserait un pavé au milieu de l'écran. */
          .anon-rail > div {
            position: static;
            max-height: none;
            overflow: visible;
          }
        }
      `}</style>
    </main>
  )
}

/* ─── Critère évalué (PR-Z) ────────────────────────────────────────
 * Affiche un critère avec sa valeur évaluée :
 *  - quantitatif → score 0-100 avec couleur tier
 *  - qualitatif  → badge ✓ / ✗ / ? avec evidence en tooltip
 * Conçu pour s'aligner verticalement dans une grid auto-fit responsive.
 */
function CriteriaEvalLine({ criterion, ev, lang }: { criterion: Criterion; ev: CriterionEval | undefined; lang: Lang }) {
  const isQuant = kindOf(criterion.type) === "quantitative"
  const score = isQuant ? (ev?.score ?? null) : null
  const status = isQuant ? undefined : ev?.status
  const name = criterionHeaderLabel(criterion, lang)
  const fullLabel = shortCriterionLabel(criterion, lang)
  const tooltip = ev?.evidence ? `${fullLabel} — ${ev.evidence}` : fullLabel

  if (isQuant) {
    const p = dimColor(score)
    const pct = score != null ? Math.max(0, Math.min(100, score)) : 0
    return (
      <div title={tooltip} style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 6, marginBottom: 4 }}>
          <span style={{
            fontSize: 11, color: "var(--nw-text-muted)", fontWeight: 600,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0,
          }}>{name}</span>
          <span style={{
            fontSize: 12, fontWeight: 800, color: p.color,
            fontVariantNumeric: "tabular-nums", flexShrink: 0,
          }}>{score != null ? score : "—"}</span>
        </div>
        <div style={{ height: 5, borderRadius: 99, background: "#EFEBF8", overflow: "hidden" }}>
          <div style={{
            width: `${pct}%`, height: "100%", borderRadius: 99,
            background: p.color, transition: "width 400ms cubic-bezier(0.22,1,0.36,1)",
          }} />
        </div>
      </div>
    )
  }

  const p = statusColor(status)
  return (
    <div
      title={tooltip}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "6px 10px",
        background: p.bg, border: `1px solid ${p.bd}`,
        borderRadius: 8, minWidth: 0,
      }}
    >
      <span style={{
        fontSize: 11.5, color: "var(--nw-text-secondary)", fontWeight: 600,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        flex: 1, minWidth: 0,
      }}>{name}</span>
      <span style={{
        fontSize: 13, fontWeight: 800, color: p.color,
        width: 18, height: 18, borderRadius: "50%",
        background: "white", border: `1px solid ${p.bd}`,
        display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        {p.icon}
      </span>
    </div>
  )
}
