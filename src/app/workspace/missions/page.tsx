"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { m } from "framer-motion"
import { getSupabase } from "@/lib/supabase"
import type { Candidate, Job } from "@/lib/database.types"
import { MissionsSkeleton } from "@/components/workspace/PageSkeletons"
import Select from "@/components/ui/Select"
import { useEscapeKey } from "@/components/ui/useEscapeKey"
import { CriteriaOnboarding } from "@/components/workspace/CriteriaOnboarding"
import { useWorkspace } from "../layout"
import { hasPricingAccess } from "@/lib/subscription"
import { seniorityIntervalLabel } from "@/lib/seniority"
import { hsl } from "@/lib/vivier-clusters"
import { sectorHue } from "@/lib/sector-color"
import { rejectReasonLabel, type RejectReason } from "@/lib/reject-reasons"
import { useLanguage, type Lang } from "@/lib/i18n/LanguageContext"

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

const copy = {
  fr: {
    noFirstName: "Sans prénom",
    member: "Membre",
    badge: "Missions",
    title: "Vos missions",
    subtitleEmpty: "Décrivez une mission. Nora la matche avec votre vivier.",
    subtitleCount: (n: number) => `${n} mission${n > 1 ? "s" : ""}.`,
    createMission: "+ Créer une mission",
    searchPlaceholder: "Rechercher par titre, lieu, compétence…",
    noResults: (q: string) => `Aucune mission ne correspond à « ${q} ».`,
    clearFilter: "Effacer le filtre",
    myMissions: "Mes missions",
    missionsOf: (name: string) => `Missions de ${name}`,
    missionCount: (n: number) => `· ${n} mission${n > 1 ? "s" : ""}`,
    overview: "Vue d'ensemble",
    relevantCandidates: "Candidats pertinents",
    inPipeline: "En pipeline",
    hired: "Recrutés",
    topRejectReasons: "Top motifs d'écart (30 j)",
    yearsSuffix: "ans",
    matchingInProgress: "✦ Matching en cours…",
    matched: "✓ Matché",
    matchingError: "Erreur matching",
    notMatchedYet: "Pas encore matché",
    open: "Ouvrir →",
    relevantSuffix: (n: number) => `· ${n} pertinent${n > 1 ? "s" : ""}`,
    statusDraft: "Brouillon",
    statusOpen: "Ouvert",
    statusFilled: "Pourvu",
    statusArchived: "Archivé",
    emptyTitle: "Créez votre première mission",
    emptyDesc: "Décrivez le besoin (titre, séniorité, compétences). Nora compare la mission à tout votre vivier et vous sort les candidats pertinents, classés et justifiés.",
    emptyCta: "Créer une mission",
    contractLabels: {
      cdi: "CDI", cdd: "CDD", freelance: "Freelance",
      portage: "Portage salarial", alternance: "Alternance",
    } as Record<ContractType, string>,
    lieuLabels: {
      paris_petite_couronne: "Paris + petite couronne (92, 93, 94)",
      idf_grande_couronne: "Île-de-France grande couronne",
      lyon: "Lyon",
      province: "Province",
    } as Record<PricingLieu, string>,
    briefRequired: "Collez votre brief, fiche de poste ou appel d'offre.",
    analysisTimeout: "L'analyse a pris trop de temps. Tentez un brief plus court ou réessayez.",
    emptyServerResponse: (status: number) => `Réponse vide du serveur (${status}). Réessayez ou utilisez la saisie manuelle.`,
    unreadableResponse: "Réponse serveur illisible. Réessayez ou utilisez la saisie manuelle.",
    analysisError: "Erreur d'analyse.",
    networkError: "Erreur réseau.",
    nameRequired: "Le nom de la mission est requis.",
    locationRequired: "Le lieu est requis.",
    skillRequired: "Au moins une compétence requise.",
    creationTimeout: "La création a pris trop de temps côté serveur. Réessayez — la mission a peut-être déjà été créée (vérifiez la liste).",
    unreadableResponseStatus: (status: number) => `Réponse serveur illisible (${status}). Réessayez.`,
    updateError: "Erreur de mise à jour.",
    createError: "Erreur de création.",
    editMissionBadge: "Modifier la mission",
    newMissionBadge: "Nouvelle mission",
    editingMission: "Édition de la mission",
    giveNoraBrief: "Donnez votre brief à Nora",
    manualEntry: "Saisie manuelle",
    matchingCriteria: "Critères de matching",
    reviewAndComplete: "Vérifiez et complétez",
    stepBrief: "Brief",
    stepMission: "Mission",
    stepCriteria: "Critères",
    close: "Fermer",
    briefIntro: "Collez votre brief, votre fiche de poste ou l'appel d'offre du client. Nora analyse, en extrait les détails et vous propose un formulaire pré-rempli — vous compléterez ce qui manque.",
    briefPlaceholder: "Ex : On cherche un(e) chargé(e) de développement commercial pour un client à Paris, démarrage septembre, mission de 12 mois, aisance relationnelle et anglais courant, rémunération autour de 45 000 €…",
    collapse: "Réduire",
    expand: "Élargir la zone",
    charCount: (n: string) => `${n} caractères · max 12 000`,
    noBriefManual: "Sans brief — saisie manuelle",
    analyzeCta: "Analyser avec Nora",
    analyzing: "Analyse en cours…",
    briefAnalyzed: (n: number) => `Brief analysé par Nora (${n} car.)`,
    reanalyze: "Re-analyser",
    reanalyzing: "Re-analyse…",
    missionNameLabel: "Nom de la mission *",
    missionNameHint: "signal principal du matching",
    missionNamePlaceholder: "Ex : Data Engineer",
    contractTypeLabel: "Type de contrat",
    optional: "optionnel",
    selectPlaceholder: "Sélectionner…",
    experienceLabel: "Expérience attendue",
    experienceHint: "optionnel, vide = matching ignore",
    to: "à",
    years: "ans",
    noraUnderstood: "Nora a compris : ",
    locationLabel: "Lieu *",
    locationHint: "texte libre",
    locationPlaceholder: "Paris, Lyon, remote…",
    durationLabel: "Durée (mois)",
    durationHint: "vide = à voir avec le client",
    startDateLabel: "Date de début",
    startDateHint: "vide = ASAP",
    reqSkillsLabel: "Compétences requises *",
    reqSkillsHint: "Entrée ou virgule pour ajouter",
    reqSkillsPlaceholder: "Ex : compétences clés attendues",
    niceSkillsLabel: "Compétences souhaitées (nice to have)",
    niceSkillsPlaceholder: "Ex : atouts appréciés",
    targetSalaryLabel: "Salaire cible du poste (€/an brut)",
    targetSalaryPlaceholder: "Ex : 48 000",
    pricingDetails: "Détails pricing",
    pricingSuiteOnly: "· optionnel (Suite Pricing)",
    pricingZoneLabel: "Zone pricing",
    pricingZoneHint: "URSSAF / transport",
    notSet: "non renseigné",
    tjmMinLabel: "TJM min (€/j HT)",
    tjmMinPlaceholder: "Ex : 500",
    tjmMaxLabel: "TJM max (€/j HT)",
    tjmMaxPlaceholder: "Ex : 600",
    descriptionLabel: "Contexte / description",
    descriptionHint: "affiché sur la fiche mission",
    descriptionPlaceholder: "Contexte client, environnement technique, contraintes…",
    toComplete: "À compléter",
    detected: "Détecté",
    cancel: "Annuler",
    backToBrief: "← Retour au brief",
    updating: "Mise à jour…",
    creating: "Création…",
    saveChanges: "Valider les modifications",
    createMissionCta: "Créer la mission",
    validateAndOpen: "Valider et ouvrir la mission",
  },
  en: {
    noFirstName: "No first name",
    member: "Member",
    badge: "Missions",
    title: "Your missions",
    subtitleEmpty: "Describe a mission. Nora matches it against your talent pool.",
    subtitleCount: (n: number) => `${n} mission${n > 1 ? "s" : ""}.`,
    createMission: "+ Create a mission",
    searchPlaceholder: "Search by title, location, skill…",
    noResults: (q: string) => `No mission matches "${q}".`,
    clearFilter: "Clear filter",
    myMissions: "My missions",
    missionsOf: (name: string) => `${name}'s missions`,
    missionCount: (n: number) => `· ${n} mission${n > 1 ? "s" : ""}`,
    overview: "Overview",
    relevantCandidates: "Relevant candidates",
    inPipeline: "In pipeline",
    hired: "Hired",
    topRejectReasons: "Top rejection reasons (30 days)",
    yearsSuffix: "yrs",
    matchingInProgress: "✦ Matching in progress…",
    matched: "✓ Matched",
    matchingError: "Matching error",
    notMatchedYet: "Not matched yet",
    open: "Open →",
    relevantSuffix: (n: number) => `· ${n} relevant`,
    statusDraft: "Draft",
    statusOpen: "Open",
    statusFilled: "Filled",
    statusArchived: "Archived",
    emptyTitle: "Create your first mission",
    emptyDesc: "Describe the need (title, seniority, skills). Nora compares the mission against your entire talent pool and surfaces relevant candidates, ranked and justified.",
    emptyCta: "Create a mission",
    contractLabels: {
      cdi: "Permanent contract", cdd: "Fixed-term contract", freelance: "Freelance",
      portage: "Umbrella contract", alternance: "Apprenticeship",
    } as Record<ContractType, string>,
    lieuLabels: {
      paris_petite_couronne: "Paris + inner suburbs (92, 93, 94)",
      idf_grande_couronne: "Île-de-France outer suburbs",
      lyon: "Lyon",
      province: "Rest of France",
    } as Record<PricingLieu, string>,
    briefRequired: "Paste your brief, job description, or RFP.",
    analysisTimeout: "The analysis took too long. Try a shorter brief or try again.",
    emptyServerResponse: (status: number) => `Empty server response (${status}). Try again or use manual entry.`,
    unreadableResponse: "Unreadable server response. Try again or use manual entry.",
    analysisError: "Analysis error.",
    networkError: "Network error.",
    nameRequired: "The mission name is required.",
    locationRequired: "Location is required.",
    skillRequired: "At least one required skill.",
    creationTimeout: "Creation took too long server-side. Try again — the mission may already have been created (check the list).",
    unreadableResponseStatus: (status: number) => `Unreadable server response (${status}). Try again.`,
    updateError: "Update error.",
    createError: "Creation error.",
    editMissionBadge: "Edit mission",
    newMissionBadge: "New mission",
    editingMission: "Editing the mission",
    giveNoraBrief: "Give Nora your brief",
    manualEntry: "Manual entry",
    matchingCriteria: "Matching criteria",
    reviewAndComplete: "Review and complete",
    stepBrief: "Brief",
    stepMission: "Mission",
    stepCriteria: "Criteria",
    close: "Close",
    briefIntro: "Paste your brief, job description, or the client's RFP. Nora analyzes it, extracts the details, and gives you a pre-filled form — you complete what's missing.",
    briefPlaceholder: "E.g.: Looking for a business development manager for a Paris-based client, starting September, 12-month mission, strong interpersonal skills and fluent English, salary around €45,000…",
    collapse: "Collapse",
    expand: "Expand the field",
    charCount: (n: string) => `${n} characters · max 12,000`,
    noBriefManual: "No brief — manual entry",
    analyzeCta: "Analyze with Nora",
    analyzing: "Analyzing…",
    briefAnalyzed: (n: number) => `Brief analyzed by Nora (${n} chars.)`,
    reanalyze: "Re-analyze",
    reanalyzing: "Re-analyzing…",
    missionNameLabel: "Mission name *",
    missionNameHint: "main matching signal",
    missionNamePlaceholder: "E.g.: Data Engineer",
    contractTypeLabel: "Contract type",
    optional: "optional",
    selectPlaceholder: "Select…",
    experienceLabel: "Expected experience",
    experienceHint: "optional, empty = ignored by matching",
    to: "to",
    years: "years",
    noraUnderstood: "Nora understood: ",
    locationLabel: "Location *",
    locationHint: "free text",
    locationPlaceholder: "Paris, Lyon, remote…",
    durationLabel: "Duration (months)",
    durationHint: "empty = to discuss with the client",
    startDateLabel: "Start date",
    startDateHint: "empty = ASAP",
    reqSkillsLabel: "Required skills *",
    reqSkillsHint: "Enter or comma to add",
    reqSkillsPlaceholder: "E.g.: key skills expected",
    niceSkillsLabel: "Nice-to-have skills",
    niceSkillsPlaceholder: "E.g.: bonus skills",
    targetSalaryLabel: "Target salary for the role (€/year gross)",
    targetSalaryPlaceholder: "E.g.: 48,000",
    pricingDetails: "Pricing details",
    pricingSuiteOnly: "· optional (Pricing Suite)",
    pricingZoneLabel: "Pricing zone",
    pricingZoneHint: "social security / commute",
    notSet: "not set",
    tjmMinLabel: "Min daily rate (€/day excl. VAT)",
    tjmMinPlaceholder: "E.g.: 500",
    tjmMaxLabel: "Max daily rate (€/day excl. VAT)",
    tjmMaxPlaceholder: "E.g.: 600",
    descriptionLabel: "Context / description",
    descriptionHint: "shown on the mission sheet",
    descriptionPlaceholder: "Client context, technical environment, constraints…",
    toComplete: "To complete",
    detected: "Detected",
    cancel: "Cancel",
    backToBrief: "← Back to brief",
    updating: "Updating…",
    creating: "Creating…",
    saveChanges: "Save changes",
    createMissionCta: "Create mission",
    validateAndOpen: "Confirm and open the mission",
  },
}

/** Pour chaque mission : couleurs dérivées de ses candidats matchés.
 *  - clusterBars : 1 ou 2 hues dominantes pour la bande verticale gauche.
 *  - top1Label / count : pour le badge contextuel sous le titre. */
interface MissionVisual {
  hues: number[]            // 0..2 éléments
  top1Label: string | null
  totalMatches: number
}

/** Stats sourcing affichées dans la sidebar (top motifs d'écart + activité
 *  réelle dont on a la donnée). Les mails ne sont pas encore intégrés. */
interface SidebarStatsData {
  topRejectReasons: Array<{ reason: RejectReason; count: number }>
  totalCandidatsMatches: number
  totalInPipeline: number
  totalRecruited: number
}

const MONTH_START_ISO = (() => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - 30)
  return d.toISOString()
})()

export default function MissionsPage() {
  const router = useRouter()
  const { lang } = useLanguage()
  const t = copy[lang]
  const sb = useMemo(() => getSupabase(), [])
  const [jobs, setJobs] = useState<Job[]>([])
  const [visuals, setVisuals] = useState<Record<string, MissionVisual>>({})
  const [stats, setStats] = useState<SidebarStatsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [members, setMembers] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    let mounted = true
    let channel: ReturnType<typeof sb.channel> | null = null
    ;(async () => {
      const { data: { user } } = await sb.auth.getUser()
      if (!user || !mounted) return
      setCurrentUserId(user.id)

      // 0) Members du cabinet — pour grouper les missions par créateur.
      //    RLS scope = org du caller (cf. migration 019), donc le SELECT
      //    ne ramène que les profils de la même org.
      const { data: profilesData } = await sb
        .from("profiles")
        .select("user_id, first_name")
      if (mounted && profilesData) {
        const m = new Map<string, string>()
        for (const p of profilesData as Array<{ user_id: string; first_name: string | null }>) {
          m.set(p.user_id, (p.first_name?.trim() || t.noFirstName))
        }
        setMembers(m)
      }

      // 1) Missions
      const { data: jobsData } = await sb
        .from("jobs").select("*").order("created_at", { ascending: false })
      if (!mounted) return
      const jobsRows = (jobsData ?? []) as Job[]
      setJobs(jobsRows)

      // 2) Matches PERTINENTS (score ≥ 55, même seuil que la fiche mission)
      //    → couleurs cluster + compteur "pertinents" de la carte. Cohérent
      //    avec le "N candidats pertinents" affiché sur la fiche.
      const { data: matchRows } = await sb
        .from("match_assessments")
        .select("job_id, candidate:candidates(id, sectors, parse_status, tags)")
        .gte("score", 55)
      if (!mounted) return
      const byJob = new Map<string, Array<Candidate>>()
      for (const r of (matchRows ?? []) as unknown as Array<{ job_id: string; candidate: Candidate | null }>) {
        const cand = r.candidate
        if (!cand || cand.parse_status !== "parsed") continue
        if (cand.tags?.includes("ancien")) continue
        const arr = byJob.get(r.job_id) ?? []
        arr.push(cand); byJob.set(r.job_id, arr)
      }
      const vMap: Record<string, MissionVisual> = {}
      for (const [jobId, cands] of byJob) {
        vMap[jobId] = computeMissionVisual(cands)
      }
      setVisuals(vMap)

      // 3) Stats sourcing : top motifs d'écart (30j) + compteurs pipeline.
      //    Pas de mails ici tant que l'intégration mail n'est pas en place.
      const { data: maRows } = await sb
        .from("match_assessments")
        .select("in_pipeline, pipeline_stage, reject_reason, updated_at, score")
      if (!mounted) return
      const reasonCount = new Map<RejectReason, number>()
      let inPipeline = 0
      let recruited = 0
      let totalMatches = 0
      for (const r of (maRows ?? []) as Array<{
        in_pipeline: boolean | null
        pipeline_stage: string | null
        reject_reason: RejectReason | null
        updated_at: string | null
        score: number | null
      }>) {
        // Même seuil "pertinent" (score ≥ 55) que les cartes mission, la fiche
        // et l'accueil — un seul chiffre, un seul sens, partout.
        if ((r.score ?? 0) >= 55) totalMatches++
        if (r.in_pipeline) inPipeline++
        if (r.pipeline_stage === "hired") recruited++
        if (r.reject_reason && r.updated_at && r.updated_at >= MONTH_START_ISO) {
          reasonCount.set(r.reject_reason, (reasonCount.get(r.reject_reason) ?? 0) + 1)
        }
      }
      const topRejectReasons = Array.from(reasonCount, ([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3)
      setStats({
        topRejectReasons,
        totalCandidatsMatches: totalMatches,
        totalInPipeline: inPipeline,
        totalRecruited: recruited,
      })

      setLoading(false)

      // Realtime sur la table jobs — pas de filtre user_id sinon les
      // changements faits par les collègues ne propagent pas dans la
      // liste. RLS org-scopée nous protège du cross-cabinet.
      channel = sb
        .channel(`jobs:org:${user.id}`)
        .on("postgres_changes",
          { event: "*", schema: "public", table: "jobs" },
          (payload) => {
            setJobs((prev) => {
              if (payload.eventType === "DELETE") return prev.filter((j) => j.id !== (payload.old as Job).id)
              const next = payload.new as Job
              const idx = prev.findIndex((j) => j.id === next.id)
              if (idx === -1) return [next, ...prev]
              const copy = [...prev]; copy[idx] = next; return copy
            })
          },
        )
        .subscribe()
    })()
    return () => { mounted = false; if (channel) sb.removeChannel(channel) }
  }, [sb])

  const filteredJobs = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return jobs
    return jobs.filter((j) => {
      const hay = [
        j.title, j.role_name, j.location, j.seniority,
        ...(j.required_skills ?? []),
        ...(j.nice_to_have_skills ?? []),
      ].filter(Boolean).join(" ").toLowerCase()
      return hay.includes(q)
    })
  }, [jobs, query])

  /** Regroupement par créateur :
   *    Section 1 : "Mes missions" (user_id = caller, même vide on saute)
   *    Section N : "Missions de Jean", "Missions de Sophie"… ordre alpha
   *
   *  Si le caller est seul dans l'org → on saute le titre de section et on
   *  rend une simple grille (UX identique à l'ancien comportement). */
  const groupedJobs = useMemo(() => {
    if (!currentUserId) return null
    const byUser = new Map<string, Job[]>()
    for (const j of filteredJobs) {
      const arr = byUser.get(j.user_id) ?? []
      arr.push(j); byUser.set(j.user_id, arr)
    }
    const mine = byUser.get(currentUserId) ?? []
    const others = Array.from(byUser.entries())
      .filter(([uid]) => uid !== currentUserId)
      .map(([uid, missions]) => ({
        userId: uid,
        firstName: members.get(uid) ?? t.member,
        missions,
      }))
      .sort((a, b) => a.firstName.localeCompare(b.firstName))
    return { mine, others, hasOthers: others.length > 0 }
  }, [filteredJobs, currentUserId, members])

  return (
    <main style={{
      minHeight: "calc(100vh - 60px)",
      padding: "32px 24px 80px",
      maxWidth: 1640, margin: "0 auto",
      fontFamily: "var(--font-inter), sans-serif",
    }}>
      {/* Header — titre + bouton créer */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 16, marginBottom: 22 }}>
        <div>
          <span style={{
            display: "inline-block",
            fontSize: 11, fontWeight: 700, color: "#7C63C8",
            background: "rgba(124,99,200,0.08)", border: "1px solid rgba(124,99,200,0.18)",
            padding: "4px 11px", borderRadius: 100,
            letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12,
          }}>
            {t.badge}
          </span>
          <h1 style={{ margin: 0, fontSize: "clamp(26px, 3vw, 34px)", fontWeight: 800, color: "#111827", letterSpacing: "-0.025em", lineHeight: 1.1 }}>
            {t.title}
          </h1>
          <p style={{ margin: "8px 0 0", fontSize: 14, color: "#6B7280", lineHeight: 1.6 }}>
            {jobs.length === 0
              ? t.subtitleEmpty
              : t.subtitleCount(jobs.length)}
          </p>
        </div>
        <button
          onClick={() => router.push("/workspace/missions/new")}
          style={{
            fontSize: 13, fontWeight: 700, color: "white",
            background: "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
            border: "none", borderRadius: 10, padding: "10px 18px", cursor: "pointer",
            boxShadow: "0 6px 20px -8px rgba(124,99,200,0.55)", fontFamily: "inherit",
          }}
        >
          {t.createMission}
        </button>
      </div>

      {loading ? (
        <MissionsSkeleton />
      ) : jobs.length === 0 ? (
        <EmptyState onCreate={() => router.push("/workspace/missions/new")} />
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "minmax(220px, 260px) minmax(0, 1fr)",
          gap: 16, alignItems: "start",
        }}>
          {/* Sidebar — récap activité + top motifs d'écart */}
          <SidebarStats stats={stats} totalJobs={jobs.length} />

          {/* Right — search bar pleine largeur + grid missions */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
            <input
              type="search"
              placeholder={t.searchPlaceholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{
                width: "100%",
                fontSize: 13.5, color: "#111827",
                padding: "11px 14px",
                background: "white",
                border: "1px solid #E5E7EB",
                borderRadius: 10,
                outline: "none", fontFamily: "inherit",
                transition: "border-color 150ms, box-shadow 150ms",
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "#C4B6E0"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(124,99,200,0.10)" }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "#E5E7EB"; e.currentTarget.style.boxShadow = "none" }}
            />
            {filteredJobs.length === 0 ? (
              <div style={{
                padding: "40px 24px", textAlign: "center",
                background: "white", border: "1px dashed #E5E7EB", borderRadius: 14,
                color: "#6B7280", fontSize: 14,
                display: "flex", flexDirection: "column", alignItems: "center", gap: 14,
              }}>
                <div>{t.noResults(query)}</div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    style={{
                      padding: "9px 16px", borderRadius: 9,
                      border: "1px solid #E5E7EB", background: "white", color: "#374151",
                      fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                    }}
                  >
                    {t.clearFilter}
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push("/workspace/missions/new")}
                    style={{
                      padding: "9px 16px", borderRadius: 9,
                      border: "none", color: "white",
                      background: "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
                      fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                    }}
                  >
                    {t.createMission}
                  </button>
                </div>
              </div>
            ) : groupedJobs && groupedJobs.hasOthers ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
                {groupedJobs.mine.length > 0 && (
                  <MissionGroup
                    title={t.myMissions}
                    isMine
                    jobs={groupedJobs.mine}
                    visuals={visuals}
                  />
                )}
                {groupedJobs.others.map((g) => (
                  <MissionGroup
                    key={g.userId}
                    title={t.missionsOf(g.firstName)}
                    jobs={g.missions}
                    visuals={visuals}
                  />
                ))}
              </div>
            ) : (
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
                gridAutoRows: "1fr",
                gap: 12,
              }}>
                {filteredJobs.map((j, i) => (
                  <JobCard
                    key={j.id}
                    job={j}
                    visual={visuals[j.id]}
                    delay={Math.min(i * 0.03, 0.2)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  )
}

/* ─── Group de missions par créateur ──────────────────────────────── */

function MissionGroup({
  title, jobs, visuals, isMine,
}: {
  title: string
  jobs: Job[]
  visuals: Record<string, MissionVisual>
  isMine?: boolean
}) {
  const { lang } = useLanguage()
  const t = copy[lang]
  const accent = isMine ? "#7C63C8" : "#6B7280"
  return (
    <section>
      <header style={{
        display: "flex", alignItems: "baseline", gap: 10,
        marginBottom: 12,
      }}>
        <span style={{
          width: 4, height: 16, borderRadius: 4,
          background: accent, display: "inline-block",
        }} />
        <h2 style={{
          margin: 0, fontSize: 14, fontWeight: 700,
          color: isMine ? "#111827" : "#374151",
          letterSpacing: "-0.005em",
        }}>
          {title}
        </h2>
        <span style={{
          fontSize: 11.5, fontWeight: 600, color: "#6B7280",
        }}>
          {t.missionCount(jobs.length)}
        </span>
      </header>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
        gridAutoRows: "1fr",
        gap: 12,
      }}>
        {jobs.map((j, i) => (
          <JobCard
            key={j.id}
            job={j}
            visual={visuals[j.id]}
            delay={Math.min(i * 0.03, 0.2)}
          />
        ))}
      </div>
    </section>
  )
}

/* ─── Sidebar ──────────────────────────────────────────────────── */

function SidebarStats({ stats, totalJobs }: { stats: SidebarStatsData | null; totalJobs: number }) {
  const { lang } = useLanguage()
  const t = copy[lang]
  return (
    <aside style={{
      position: "sticky", top: 16,
      display: "flex", flexDirection: "column", gap: 14,
      paddingTop: 38,  // aligne avec le bas de la recherche
    }}>
      <StatGroup title={t.overview}>
        <StatRow label={t.badge}              value={totalJobs} />
        <StatRow label={t.relevantCandidates} value={stats?.totalCandidatsMatches ?? 0} />
        <StatRow
          label={t.inPipeline}
          value={stats?.totalInPipeline ?? 0}
          tone={(stats?.totalInPipeline ?? 0) > 0 ? "good" : undefined}
        />
        <StatRow
          label={t.hired}
          value={stats?.totalRecruited ?? 0}
          tone={(stats?.totalRecruited ?? 0) > 0 ? "good" : undefined}
        />
      </StatGroup>

      {stats && stats.topRejectReasons.length > 0 && (
        <StatGroup title={t.topRejectReasons}>
          {stats.topRejectReasons.map((r) => (
            <StatRow
              key={r.reason}
              label={rejectReasonLabel(r.reason, lang)}
              value={r.count}
              tone="warn"
            />
          ))}
        </StatGroup>
      )}
    </aside>
  )
}

function StatGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: "white", border: "1px solid #F0ECF8", borderRadius: 12,
      padding: 12,
    }}>
      <div style={{
        fontSize: 9.5, fontWeight: 700, color: "#6B7280",
        letterSpacing: "0.08em", textTransform: "uppercase",
        marginBottom: 8, padding: "0 2px",
      }}>
        {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {children}
      </div>
    </div>
  )
}

function StatRow({ label, value, tone }: { label: string; value: number | string; tone?: "good" | "warn" }) {
  const valueColor = tone === "good" ? "#15803d" : tone === "warn" ? "#B45309" : "#111827"
  return (
    <div style={{
      display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8,
      padding: "4px 2px",
      fontSize: 12,
    }}>
      <span style={{ color: "#6B7280" }}>{label}</span>
      <span style={{ fontWeight: 800, color: valueColor, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </span>
    </div>
  )
}

/* ─── Couleur mission = secteurs des candidats matchés ──────────── */

function computeMissionVisual(candidates: Candidate[]): MissionVisual {
  // Secteur dominant parmi les candidats matchés (secteur primaire = 1ᵉʳ).
  const counts = new Map<string, number>()
  for (const c of candidates) {
    const primary = (c.sectors ?? [])[0]
    if (!primary) continue
    counts.set(primary, (counts.get(primary) ?? 0) + 1)
  }
  const total = candidates.length
  const sorted = Array.from(counts, ([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count)
  if (sorted.length === 0) return { hues: [], top1Label: null, totalMatches: total }
  const top1 = sorted[0]
  const hues: number[] = [sectorHue(top1.label)]
  // Bicolore si le 2ᵉ secteur représente ≥ 30 % — sinon couleur unique.
  if (sorted.length > 1 && sorted[1].count / total >= 0.3) {
    hues.push(sectorHue(sorted[1].label))
  }
  return { hues, top1Label: top1.label, totalMatches: total }
}

/* ─── Helpers ──────────────────────────────────────────────────── */

/** Human label for a mission's seniority — interval ("Mid → Senior") if the
 *  mission carries one in `normalized`, else the legacy free string. */
function seniorityLabel(job: Job, lang: Lang): string | null {
  const n = job.normalized
  const iv = seniorityIntervalLabel(n?.seniority_min_years, n?.seniority_max_years)
  if (iv) {
    const lo = n?.seniority_min_years, hi = n?.seniority_max_years
    if (lo != null && hi != null) return `${iv} · ${lo}–${hi} ${copy[lang].yearsSuffix}`
    return iv
  }
  return job.seniority?.trim() || null
}

/* ─── Job card ─────────────────────────────────────────────────── */

function JobCard({ job, visual, delay }: {
  job: Job
  visual: MissionVisual | undefined
  delay: number
}) {
  const { lang } = useLanguage()
  const t = copy[lang]
  const ms = job.match_status

  // Bande couleur secteur — dérivée des candidats matchés. Monochrome ou
  // bicolore en gradient selon la composition du matching. Gris si pas
  // encore de matching.
  const hues = visual?.hues ?? []
  const barBackground =
    hues.length === 0   ? "#E5E7EB" :
    hues.length === 1   ? hsl(hues[0], 60, 55) :
    `linear-gradient(180deg, ${hsl(hues[0], 60, 55)} 0%, ${hsl(hues[1], 60, 55)} 100%)`

  return (
    <m.div
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: EASE }}
      whileHover={{ y: -2 }}
      style={{
        background: "white", borderRadius: 12, border: "1px solid #F0ECF8",
        padding: "14px 16px 14px 20px",
        display: "flex", flexDirection: "column", gap: 9,
        position: "relative", overflow: "hidden",
      }}
    >
      {/* Bande verticale couleur secteur dominant */}
      <span style={{
        position: "absolute", top: 0, bottom: 0, left: 0, width: 4,
        background: barBackground,
      }} />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: "#111827", lineHeight: 1.3 }}>
            {job.role_name?.trim() || job.title}
          </h2>
          {job.role_name?.trim() && job.title && job.title !== job.role_name && (
            <p style={{ margin: "2px 0 0", fontSize: 11, color: "#6B7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {job.title}
            </p>
          )}
        </div>
        <StatusChip status={job.status} />
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, fontSize: 11, color: "#6B7280" }}>
        {job.location && <Meta>{job.location}</Meta>}
        {seniorityLabel(job, lang) && <Meta>{seniorityLabel(job, lang)}</Meta>}
        {job.contract_type && <Meta>{job.contract_type}</Meta>}
      </div>

      {/* Badge cluster dominant — la "saveur" du sourcing pour cette mission */}
      {visual?.top1Label && (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            fontSize: 10, fontWeight: 700,
            color: hsl(hues[0], 55, 35),
            background: hsl(hues[0], 70, 95),
            border: `1px solid ${hsl(hues[0], 50, 80)}`,
            borderRadius: 100, padding: "1.5px 8px",
          }}>
            <span style={{
              width: 5, height: 5, borderRadius: "50%",
              background: hues.length > 1
                ? `linear-gradient(180deg, ${hsl(hues[0], 65, 55)} 0%, ${hsl(hues[1], 65, 55)} 100%)`
                : hsl(hues[0], 65, 55),
            }} />
            {visual.top1Label}
          </span>
          <span style={{ fontSize: 10, color: "#6B7280" }}>
            {t.relevantSuffix(visual.totalMatches)}
          </span>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto", paddingTop: 2 }}>
        <span style={{ fontSize: 11, color: "#6B7280" }}>
          {ms === "matching" ? t.matchingInProgress
            : ms === "done" ? t.matched
            : ms === "error" ? t.matchingError
            : t.notMatchedYet}
        </span>
        <Link href={`/workspace/missions/${job.id}`} style={{
          fontSize: 11, fontWeight: 600, color: "#7C63C8",
          padding: "5px 10px", borderRadius: 7,
          background: "rgba(124,99,200,0.08)", border: "1px solid rgba(124,99,200,0.16)",
          textDecoration: "none",
        }}>
          {t.open}
        </Link>
      </div>
    </m.div>
  )
}

function Meta({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      background: "#F9FAFB", border: "1px solid #F0ECF8",
      padding: "3px 8px", borderRadius: 6,
    }}>{children}</span>
  )
}

function StatusChip({ status }: { status: Job["status"] }) {
  const { lang } = useLanguage()
  const t = copy[lang]
  const map: Record<Job["status"], { label: string; bg: string; fg: string; bd: string }> = {
    draft:    { label: t.statusDraft,    bg: "#F3F4F6", fg: "#6B7280", bd: "#E5E7EB" },
    open:     { label: t.statusOpen,     bg: "rgba(34,197,94,0.10)", fg: "#16a34a", bd: "rgba(34,197,94,0.22)" },
    filled:   { label: t.statusFilled,   bg: "rgba(124,99,200,0.10)", fg: "#7C63C8", bd: "rgba(124,99,200,0.22)" },
    archived: { label: t.statusArchived, bg: "#F3F4F6", fg: "#6B7280", bd: "#E5E7EB" },
  }
  const s = map[status]
  return (
    <span style={{
      flexShrink: 0,
      fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 100,
      background: s.bg, color: s.fg, border: `1px solid ${s.bd}`,
      letterSpacing: "0.04em", textTransform: "uppercase",
    }}>{s.label}</span>
  )
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  const { lang } = useLanguage()
  const t = copy[lang]
  return (
    <m.div
      initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: EASE }}
      style={{
        marginTop: 40, padding: "72px 36px",
        background: "white", border: "2px dashed #E2DAF6", borderRadius: 22,
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 56, marginBottom: 16 }}>📋</div>
      <h2 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 800, color: "#111827", letterSpacing: "-0.015em" }}>
        {t.emptyTitle}
      </h2>
      <p style={{ margin: "0 auto 18px", maxWidth: 460, fontSize: 14, color: "#6B7280", lineHeight: 1.65 }}>
        {t.emptyDesc}
      </p>
      <button onClick={onCreate} style={{
        padding: "11px 22px", borderRadius: 12, border: "none", cursor: "pointer",
        background: "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
        color: "white", fontWeight: 700, fontSize: 14, fontFamily: "inherit",
        boxShadow: "0 8px 24px -8px rgba(124,99,200,0.5)",
      }}>
        {t.emptyCta}
      </button>
    </m.div>
  )
}

/* ─── Create modal (centered) ──────────────────────────────────── */

type ContractType = "cdi" | "cdd" | "freelance" | "portage" | "alternance"
type PricingLieu = "paris_petite_couronne" | "idf_grande_couronne" | "lyon" | "province"

interface ExtractedFields {
  role_name: string | null
  seniority_min_years: number | null
  seniority_max_years: number | null
  contract_type: ContractType | null
  location: string | null
  pricing_lieu: PricingLieu | null
  required_skills: string[]
  nice_to_have_skills: string[]
  duration_months: number | null
  start_date: string | null
  client_tjm_min: number | null
  client_tjm_max: number | null
  target_gross_salary: number | null
  description: string | null
}

const EMPTY_EXTRACTED: ExtractedFields = {
  role_name: null,
  seniority_min_years: null,
  seniority_max_years: null,
  contract_type: null,
  location: null,
  pricing_lieu: null,
  required_skills: [],
  nice_to_have_skills: [],
  duration_months: null,
  start_date: null,
  client_tjm_min: null,
  client_tjm_max: null,
  target_gross_salary: null,
  description: null,
}

export function JobForm({ onClose, onCreated, initialJob, variant = "modal" }: {
  onClose: () => void
  onCreated: (j: Job) => void
  /** Si fourni, le modal s'ouvre en mode "edit" (skip brief stage, PATCH au lieu de POST). */
  initialJob?: Job | null
  /** "modal" (édition, overlay) ou "page" (création plein écran, pas de popup). */
  variant?: "modal" | "page"
}) {
  // En mode page, Échap ne ferme pas (pas de sens sur une page) — on garde le
  // hook uniquement pour l'overlay modal.
  useEscapeKey(variant === "modal" ? onClose : () => {})
  const { lang } = useLanguage()
  const t = copy[lang]
  // Champs adaptatifs : le bloc pricing (zone / TJM) n'apparaît que si l'org a
  // accès pricing (admin / abonnement pricing / essai gratuit). Le salaire
  // cible du poste, lui, reste UNIVERSEL (affiché pour tous les sourceurs).
  const { organization, profile } = useWorkspace()
  const hasPricing = hasPricingAccess(organization, { isAdmin: !!profile?.is_admin })
  // Stage 1 : brief texte. Stage 2 : form pré-rempli.
  const editMode = !!initialJob
  // "criteria" = 3ᵉ étape (création only) : les critères de matching sont
  // définis DANS le flow de création, pas comme un 2ᵉ wizard sur la page
  // mission. La page mission devient un pur cockpit.
  const [stage, setStage] = useState<"brief" | "form" | "manual" | "criteria">(editMode ? "form" : "brief")
  const [createdJob, setCreatedJob] = useState<Job | null>(null)
  const [brief, setBrief] = useState(initialJob?.briefing ?? "")
  const [extracting, setExtracting] = useState(false)
  const [extractError, setExtractError] = useState<string | null>(null)
  const [briefExpanded, setBriefExpanded] = useState(false)
  const [extracted, setExtracted] = useState<ExtractedFields>(EMPTY_EXTRACTED)

  // Form fields. En edit-mode, pré-remplis depuis initialJob.
  const j = initialJob
  const [roleName, setRoleName] = useState(j?.role_name ?? j?.title ?? "")
  const [contractType, setContractType] = useState<ContractType | "">((j?.contract_type as ContractType) ?? "")
  const [location, setLocation] = useState(j?.location ?? "")
  const [pricingLieu, setPricingLieu] = useState<PricingLieu | "">((j?.pricing_lieu as PricingLieu) ?? "")
  const [seniorityMin, setSeniorityMin] = useState(
    j?.normalized?.seniority_min_years != null ? String(j.normalized.seniority_min_years) : "",
  )
  const [seniorityMax, setSeniorityMax] = useState(
    j?.normalized?.seniority_max_years != null ? String(j.normalized.seniority_max_years) : "",
  )
  const [reqSkills, setReqSkills] = useState<string[]>(j?.required_skills ?? [])
  const [niceSkills, setNiceSkills] = useState<string[]>(j?.nice_to_have_skills ?? [])
  const [durationMonths, setDurationMonths] = useState(j?.duration_months != null ? String(j.duration_months) : "")
  const [startDate, setStartDate] = useState(j?.start_date ?? "")
  const [tjmMin, setTjmMin] = useState(j?.client_tjm_min != null ? String(j.client_tjm_min) : "")
  const [tjmMax, setTjmMax] = useState(j?.client_tjm_max != null ? String(j.client_tjm_max) : "")
  const [targetBrut, setTargetBrut] = useState(j?.target_gross_salary != null ? String(j.target_gross_salary) : "")
  const [description, setDescription] = useState(j?.description ?? "")

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const minNum = seniorityMin === "" ? null : Number(seniorityMin)
  const maxNum = seniorityMax === "" ? null : Number(seniorityMax)
  const detected = seniorityIntervalLabel(minNum, maxNum)

  const applyExtracted = (e: ExtractedFields) => {
    setExtracted(e)
    setRoleName(e.role_name ?? "")
    setContractType(e.contract_type ?? "")
    setLocation(e.location ?? "")
    setPricingLieu(e.pricing_lieu ?? "")
    setSeniorityMin(e.seniority_min_years != null ? String(e.seniority_min_years) : "")
    setSeniorityMax(e.seniority_max_years != null ? String(e.seniority_max_years) : "")
    setReqSkills(e.required_skills)
    setNiceSkills(e.nice_to_have_skills)
    setDurationMonths(e.duration_months != null ? String(e.duration_months) : "")
    setStartDate(e.start_date ?? "")
    setTjmMin(e.client_tjm_min != null ? String(e.client_tjm_min) : "")
    setTjmMax(e.client_tjm_max != null ? String(e.client_tjm_max) : "")
    setTargetBrut(e.target_gross_salary != null ? String(e.target_gross_salary) : "")
    setDescription(e.description ?? "")
  }

  const runExtract = async () => {
    if (!brief.trim()) { setExtractError(t.briefRequired); return }
    setExtracting(true); setExtractError(null)
    try {
      const res = await fetch("/api/jobs/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief: brief.trim() }),
      })
      // On lit d'abord le corps en texte : si la fonction Vercel a
      // timeout ou crash, le corps peut être vide et `res.json()`
      // explose avec "Unexpected end of JSON input". On gère ça
      // explicitement pour donner un message utile au sourceur.
      const rawText = await res.text()
      if (!rawText) {
        setExtractError(res.status === 504 || res.status === 502
          ? t.analysisTimeout
          : t.emptyServerResponse(res.status))
        setExtracting(false)
        return
      }
      let data: { ok?: boolean; extracted?: ExtractedFields; message?: string; error?: string }
      try {
        data = JSON.parse(rawText)
      } catch {
        setExtractError(t.unreadableResponse)
        setExtracting(false)
        return
      }
      if (!res.ok || !data.ok || !data.extracted) {
        setExtractError(data.message ?? data.error ?? t.analysisError)
        setExtracting(false)
        return
      }
      applyExtracted(data.extracted)
      setStage("form")
      setBriefExpanded(false)
    } catch (err) {
      setExtractError((err as Error).message ?? t.networkError)
    } finally {
      setExtracting(false)
    }
  }

  const submitForm = async () => {
    // Obligatoires V1 : juste nom du poste + lieu + compétences. Tout le
    // reste peut être complété plus tard (mission "ASAP" sans date, type
    // de contrat à confirmer côté pricing, durée à voir avec le client…).
    if (!roleName.trim()) { setError(t.nameRequired); return }
    if (!location.trim()) { setError(t.locationRequired); return }
    if (reqSkills.length === 0) { setError(t.skillRequired); return }

    setSubmitting(true); setError(null)
    const payload = {
      role_name: roleName,
      title: roleName,                            // on ne demande plus d'intitulé
      location,
      pricing_lieu: pricingLieu || null,
      contract_type: contractType || null,
      seniority_min_years: minNum,
      seniority_max_years: maxNum,
      required_skills: reqSkills,
      nice_to_have_skills: niceSkills,
      description,
      briefing: brief.trim() || null,             // on persiste le brief original
      duration_months: durationMonths ? Number(durationMonths) : null,
      start_date: startDate || null,
      client_tjm_min: tjmMin ? Number(tjmMin) : null,
      client_tjm_max: tjmMax ? Number(tjmMax) : null,
      target_gross_salary: targetBrut ? Number(targetBrut) : null,
    }
    try {
      const res = await fetch(
        editMode ? `/api/jobs/${initialJob!.id}` : "/api/jobs",
        {
          method: editMode ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      )
      // Parsing robuste : un timeout serveur (504) renvoie un corps NON-JSON
      // ("An error occurred…"). res.json() planterait alors avec "Unexpected
      // token" — on lit le texte d'abord et on parse à la main.
      const rawText = await res.text()
      let data: { job?: Job; message?: string; error?: string } = {}
      try {
        data = rawText ? JSON.parse(rawText) : {}
      } catch {
        setError(res.status === 504 || res.status === 502
          ? t.creationTimeout
          : t.unreadableResponseStatus(res.status))
        setSubmitting(false)
        return
      }
      if (!res.ok || !data.job) {
        setError(data.message ?? data.error ?? (editMode ? t.updateError : t.createError))
        setSubmitting(false)
        return
      }
      const jobRes = data.job as Job
      if (editMode) {
        // Édition : on ne touche pas aux critères, on ferme.
        onCreated(jobRes)
      } else {
        // Création : dernière étape du wizard = les critères de matching,
        // DANS la même modale (plus de 2ᵉ wizard sur la page mission).
        setCreatedJob(jobRes)
        setStage("criteria")
        setSubmitting(false)
      }
    } catch (err) {
      setError((err as Error).message ?? t.networkError)
      setSubmitting(false)
    }
  }

  /** Statut visuel d'un champ : "complet" / "manquant" / "à confirmer". */
  const statusOf = (value: unknown, llmWasNull: boolean): "ok" | "missing" | "review" => {
    const empty = value === "" || value == null || (Array.isArray(value) && value.length === 0)
    if (empty) return "missing"
    if (llmWasNull) return "ok"   // sourceur a complété → ok
    return "ok"                    // LLM a donné, ok par défaut
  }
  void statusOf // helper réservé si on veut afficher 3 états ; pour l'instant on affiche ⚠ uniquement sur manquant

  const isPage = variant === "page"
  return (
    <>
      <m.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={isPage ? undefined : onClose}
        style={isPage ? {
          // Mode page : conteneur statique centré, pas d'overlay ni de fond.
          position: "relative", width: "100%",
          display: "flex", alignItems: "flex-start", justifyContent: "center",
          padding: 0,
        } : {
          position: "fixed", inset: 0, zIndex: 50,
          background: "rgba(17,24,39,0.40)", backdropFilter: "blur(2px)",
          display: "flex", alignItems: "flex-start", justifyContent: "center",
          padding: "5vh 20px", overflowY: "auto",
        }}
      >
        <m.div
          initial={{ opacity: 0, y: isPage ? 8 : 16, scale: isPage ? 1 : 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.98 }}
          transition={{ duration: 0.3, ease: EASE }}
          onClick={(e) => e.stopPropagation()}
          style={{
            width: "100%", maxWidth: stage === "criteria" ? 860 : 640,
            background: "white", borderRadius: 18,
            boxShadow: isPage ? "0 1px 3px rgba(17,24,39,0.06), 0 10px 34px -20px rgba(124,99,200,0.35)" : "0 30px 80px rgba(17,24,39,0.28)",
            border: isPage ? "1px solid #F0ECF8" : undefined,
            display: "flex", flexDirection: "column",
            fontFamily: "var(--font-inter), sans-serif",
            overflow: "hidden",
            transition: "max-width 260ms cubic-bezier(0.22,1,0.36,1)",
          }}
        >
          {/* Header */}
          <div style={{ padding: "22px 28px 18px", borderBottom: "1px solid #F0ECF8", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "#7C63C8", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                {editMode ? t.editMissionBadge : t.newMissionBadge}
              </p>
              <h2 style={{ margin: "4px 0 0", fontSize: 20, fontWeight: 800, color: "#111827", letterSpacing: "-0.02em" }}>
                {editMode
                  ? t.editingMission
                  : stage === "brief" ? t.giveNoraBrief
                  : stage === "manual" ? t.manualEntry
                  : stage === "criteria" ? t.matchingCriteria
                  : t.reviewAndComplete}
              </h2>
              {/* Stepper création (3 étapes) — masqué en édition/manuel. */}
              {!editMode && stage !== "manual" && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10 }}>
                  {[
                    { k: "brief", n: 1, label: t.stepBrief },
                    { k: "form", n: 2, label: t.stepMission },
                    { k: "criteria", n: 3, label: t.stepCriteria },
                  ].map((s, i) => {
                    const order = ["brief", "form", "criteria"]
                    const cur = order.indexOf(stage)
                    const done = i < cur
                    const active = order[i] === stage
                    return (
                      <span key={s.k} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        {i > 0 && <span style={{ width: 16, height: 1, background: done || active ? "#7C63C8" : "#E5E7EB" }} />}
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                          <span style={{
                            width: 18, height: 18, borderRadius: "50%",
                            display: "inline-flex", alignItems: "center", justifyContent: "center",
                            fontSize: 10.5, fontWeight: 800,
                            color: active ? "white" : done ? "#7C63C8" : "#6B7280",
                            background: active ? "#7C63C8" : done ? "rgba(124,99,200,0.12)" : "#F3F4F6",
                            border: `1px solid ${active || done ? "rgba(124,99,200,0.35)" : "#E5E7EB"}`,
                          }}>{done ? "✓" : s.n}</span>
                          <span style={{ fontSize: 11, fontWeight: active ? 700 : 600, color: active ? "#111827" : "#6B7280" }}>{s.label}</span>
                        </span>
                      </span>
                    )
                  })}
                </div>
              )}
            </div>
            <button onClick={onClose} aria-label={t.close} style={{
              background: "transparent", border: "none", cursor: "pointer",
              fontSize: 22, color: "#6B7280", lineHeight: 1, padding: 4,
            }}>✕</button>
          </div>

          {/* ─── STAGE 1 : brief texte ─── */}
          {stage === "brief" && (
            <div style={{ padding: 28, display: "flex", flexDirection: "column", gap: 16 }}>
              <p style={{ margin: 0, fontSize: 13, color: "#6B7280", lineHeight: 1.6 }}>
                {t.briefIntro}
              </p>

              <textarea
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                placeholder={t.briefPlaceholder}
                rows={briefExpanded ? 18 : 9}
                style={{
                  ...inputStyle, resize: "vertical", lineHeight: 1.6,
                  fontFamily: "var(--font-inter), sans-serif",
                  maxHeight: briefExpanded ? "60vh" : 280,
                  overflowY: "auto",
                }}
                autoFocus
              />

              {brief.length > 0 && (
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  fontSize: 11.5, color: "#6B7280",
                }}>
                  <button
                    type="button"
                    onClick={() => setBriefExpanded((v) => !v)}
                    style={{
                      background: "none", border: "none", cursor: "pointer",
                      fontSize: 12, color: "#7C63C8", fontWeight: 600,
                      padding: 0, textDecoration: "underline",
                    }}
                  >
                    {briefExpanded ? t.collapse : t.expand}
                  </button>
                  <span>{t.charCount(brief.length.toLocaleString(lang === "fr" ? "fr-FR" : "en-US"))}</span>
                </div>
              )}

              {extractError && (
                <div style={{
                  padding: "10px 14px", background: "#FEF2F2", border: "1px solid #FECACA",
                  borderRadius: 10, fontSize: 13, color: "#B91C1C",
                }}>{extractError}</div>
              )}

              <div style={{ display: "flex", gap: 10, justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                <button
                  type="button"
                  onClick={() => setStage("manual")}
                  style={{
                    fontSize: 12.5, color: "#6B7280", background: "none", border: "none",
                    cursor: "pointer", textDecoration: "underline", padding: 0,
                  }}
                >
                  {t.noBriefManual}
                </button>
                <button
                  type="button"
                  onClick={runExtract}
                  disabled={extracting || !brief.trim()}
                  style={{
                    padding: "11px 22px", borderRadius: 10, border: "none",
                    background: extracting || !brief.trim()
                      ? "#C4B6E0"
                      : "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
                    color: "white", fontSize: 13, fontWeight: 700,
                    cursor: extracting || !brief.trim() ? "default" : "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {extracting ? t.analyzing : t.analyzeCta}
                </button>
              </div>
            </div>
          )}

          {/* ─── STAGE 2 : formulaire pré-rempli ou manual ─── */}
          {(stage === "form" || stage === "manual") && (
            <div style={{ padding: 28, display: "flex", flexDirection: "column", gap: 16 }}>
              {stage === "form" && brief && (
                <details style={{
                  background: "#F8F6FF", border: "1px solid #E2DAF6", borderRadius: 10,
                  padding: "10px 14px", fontSize: 12.5,
                }}>
                  <summary style={{ cursor: "pointer", fontWeight: 600, color: "#6B54B2" }}>
                    {t.briefAnalyzed(brief.length)}
                  </summary>
                  <textarea
                    value={brief}
                    onChange={(e) => setBrief(e.target.value)}
                    rows={6}
                    style={{ ...inputStyle, marginTop: 10, resize: "vertical", lineHeight: 1.5 }}
                  />
                  <button type="button" onClick={runExtract} disabled={extracting}
                    style={{
                      marginTop: 8, padding: "7px 14px", borderRadius: 8, border: "1px solid #7C63C8",
                      background: "white", color: "#7C63C8", fontSize: 12, fontWeight: 700, cursor: "pointer",
                    }}>
                    {extracting ? t.reanalyzing : t.reanalyze}
                  </button>
                </details>
              )}

              <FormFieldGrid
                roleName={roleName} setRoleName={setRoleName}
                contractType={contractType} setContractType={setContractType}
                location={location} setLocation={setLocation}
                pricingLieu={pricingLieu} setPricingLieu={setPricingLieu}
                seniorityMin={seniorityMin} setSeniorityMin={setSeniorityMin}
                seniorityMax={seniorityMax} setSeniorityMax={setSeniorityMax}
                detected={detected}
                durationMonths={durationMonths} setDurationMonths={setDurationMonths}
                startDate={startDate} setStartDate={setStartDate}
                reqSkills={reqSkills} setReqSkills={setReqSkills}
                niceSkills={niceSkills} setNiceSkills={setNiceSkills}
                tjmMin={tjmMin} setTjmMin={setTjmMin}
                tjmMax={tjmMax} setTjmMax={setTjmMax}
                targetBrut={targetBrut} setTargetBrut={setTargetBrut}
                description={description} setDescription={setDescription}
                extracted={stage === "form" ? extracted : null}
                hasPricing={hasPricing}
              />

              {error && (
                <div style={{
                  padding: "10px 14px", background: "#FEF2F2", border: "1px solid #FECACA",
                  borderRadius: 10, fontSize: 13, color: "#B91C1C",
                }}>{error}</div>
              )}
            </div>
          )}

          {/* Footer — uniquement sur le formulaire (stage 2). L'étape critères
              a son propre pied ("Valider et ouvrir la mission"), et le brief
              a le sien : on évite le double bouton de création. */}
          {(stage === "form" || stage === "manual") && (
            <div style={{ padding: "16px 28px", borderTop: "1px solid #F0ECF8", display: "flex", gap: 10, justifyContent: "space-between" }}>
              {editMode ? (
                <button onClick={onClose} style={{
                  padding: "11px 18px", borderRadius: 10,
                  background: "white", border: "1px solid #E5E7EB", color: "#6B7280",
                  fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                }}>{t.cancel}</button>
              ) : (
                <button onClick={() => setStage("brief")} style={{
                  padding: "11px 18px", borderRadius: 10,
                  background: "white", border: "1px solid #E5E7EB", color: "#6B7280",
                  fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                }}>{t.backToBrief}</button>
              )}
              <button onClick={submitForm} disabled={submitting} style={{
                padding: "11px 24px", borderRadius: 10, border: "none",
                background: submitting ? "#C4B6E0" : "linear-gradient(120deg, #7C63C8 0%, #6B54B2 100%)",
                color: "white", fontSize: 13, fontWeight: 700,
                cursor: submitting ? "default" : "pointer", fontFamily: "inherit",
              }}>
                {submitting
                  ? (editMode ? t.updating : t.creating)
                  : (editMode ? t.saveChanges : t.createMissionCta)}
              </button>
            </div>
          )}

          {/* ─── STAGE 3 (création uniquement) : critères de matching ───
              La mission vient d'être créée ; on définit ses critères DANS le
              même wizard (embedded). La page mission n'a donc plus de 2ᵉ
              onboarding : elle s'ouvre directement en cockpit. */}
          {stage === "criteria" && createdJob && (
            <div style={{ padding: "18px 28px 26px" }}>
              <CriteriaOnboarding
                embedded
                jobId={createdJob.id}
                submitLabel={t.validateAndOpen}
                onDone={(updated) => {
                  onCreated({
                    ...createdJob,
                    criteria: updated,
                    criteria_locked_at: new Date().toISOString(),
                  } as Job)
                }}
              />
            </div>
          )}
        </m.div>
      </m.div>
    </>
  )
}

/* ─── Form fields grid — partagé entre stages "form" (avec extracted) et "manual" ─── */

interface FormFieldGridProps {
  roleName: string; setRoleName: (v: string) => void
  contractType: ContractType | ""; setContractType: (v: ContractType | "") => void
  location: string; setLocation: (v: string) => void
  pricingLieu: PricingLieu | ""; setPricingLieu: (v: PricingLieu | "") => void
  seniorityMin: string; setSeniorityMin: (v: string) => void
  seniorityMax: string; setSeniorityMax: (v: string) => void
  detected: string | null
  durationMonths: string; setDurationMonths: (v: string) => void
  startDate: string; setStartDate: (v: string) => void
  reqSkills: string[]; setReqSkills: (v: string[]) => void
  niceSkills: string[]; setNiceSkills: (v: string[]) => void
  tjmMin: string; setTjmMin: (v: string) => void
  tjmMax: string; setTjmMax: (v: string) => void
  targetBrut: string; setTargetBrut: (v: string) => void
  description: string; setDescription: (v: string) => void
  extracted: ExtractedFields | null
  /** L'org a la Suite Pricing → affiche le bloc pricing (zone/TJM/brut). */
  hasPricing: boolean
}
function FormFieldGrid(p: FormFieldGridProps) {
  const { lang } = useLanguage()
  const t = copy[lang]
  // États possibles d'un champ :
  //   - rempli + extrait par Nora     → bordure verte + pastille verte "Détecté"
  //   - rempli (manuel ou après edit) → bordure verte (pas de pastille)
  //   - vide + obligatoire            → bordure rouge
  //   - vide + optionnel              → bordure orange
  const stateOf = (current: unknown, llmValue: unknown, required: boolean): {
    border: string
    statusPill: React.ReactNode | null
  } => {
    const empty = current === "" || current == null || (Array.isArray(current) && current.length === 0)
    if (empty) {
      return required
        ? { border: BORDER.required, statusPill: <StatusPill kind="missing">{t.toComplete}</StatusPill> }
        : { border: BORDER.optional, statusPill: null }
    }
    const detected = !!(p.extracted && llmValue !== null && llmValue !== undefined &&
      (!Array.isArray(llmValue) || llmValue.length > 0))
    return {
      border: BORDER.ok,
      statusPill: detected ? <StatusPill kind="ok">{t.detected}</StatusPill> : null,
    }
  }
  const ringStyle = (border: string): React.CSSProperties => ({ ...inputStyle, borderColor: border })

  const role         = stateOf(p.roleName,        p.extracted?.role_name,           true)
  const ct           = stateOf(p.contractType,    p.extracted?.contract_type,       false)
  const loc          = stateOf(p.location,        p.extracted?.location,            true)
  const pricingState = stateOf(p.pricingLieu,     p.extracted?.pricing_lieu,        false)
  const senState     = stateOf(p.seniorityMin || p.seniorityMax, p.extracted?.seniority_min_years, false)
  const durState     = stateOf(p.durationMonths,  p.extracted?.duration_months,     false)
  const startState   = stateOf(p.startDate,       p.extracted?.start_date,          false)
  const reqState     = stateOf(p.reqSkills,       p.extracted?.required_skills,     true)
  const niceState    = stateOf(p.niceSkills,      p.extracted?.nice_to_have_skills, false)
  const tjmMinState  = stateOf(p.tjmMin,          p.extracted?.client_tjm_min,      false)
  const tjmMaxState  = stateOf(p.tjmMax,          p.extracted?.client_tjm_max,      false)
  const brutState    = stateOf(p.targetBrut,      p.extracted?.target_gross_salary, false)
  const descState    = stateOf(p.description,     p.extracted?.description,         false)

  return (
    <>
      <Field label={t.missionNameLabel} hint={t.missionNameHint} status={role.statusPill}>
        <input value={p.roleName} onChange={(e) => p.setRoleName(e.target.value)}
          placeholder={t.missionNamePlaceholder} style={ringStyle(role.border)} autoFocus />
      </Field>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Field label={t.contractTypeLabel} hint={t.optional} status={ct.statusPill}>
          <Select value={p.contractType} onChange={(v) => p.setContractType(v as ContractType | "")}
            border={ct.border} placeholder={t.selectPlaceholder}
            options={(Object.keys(t.contractLabels) as ContractType[]).map((k) => ({ value: k, label: t.contractLabels[k] }))} />
        </Field>
        <Field label={t.experienceLabel} hint={t.experienceHint} status={senState.statusPill}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="number" min={0} max={40} value={p.seniorityMin}
              onChange={(e) => p.setSeniorityMin(e.target.value)}
              placeholder="5" style={{ ...ringStyle(senState.border), width: 64, textAlign: "center" }} />
            <span style={{ fontSize: 13, color: "#6B7280" }}>{t.to}</span>
            <input type="number" min={0} max={40} value={p.seniorityMax}
              onChange={(e) => p.setSeniorityMax(e.target.value)}
              placeholder="10" style={{ ...ringStyle(senState.border), width: 64, textAlign: "center" }} />
            <span style={{ fontSize: 13, color: "#6B7280" }}>{t.years}</span>
          </div>
        </Field>
      </div>
      {p.detected && (
        <div style={{
          marginTop: -6, alignSelf: "flex-start",
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "5px 12px", borderRadius: 100,
          background: "rgba(124,99,200,0.08)", border: "1px solid rgba(124,99,200,0.20)",
          fontSize: 12, color: "#6B54B2",
        }}>
          {t.noraUnderstood}<strong style={{ color: "#7C63C8" }}>{p.detected}</strong>
        </div>
      )}

      <Field label={t.locationLabel} hint={t.locationHint} status={loc.statusPill}>
        <input value={p.location} onChange={(e) => p.setLocation(e.target.value)}
          placeholder={t.locationPlaceholder} style={ringStyle(loc.border)} />
      </Field>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Field label={t.durationLabel} hint={t.durationHint} status={durState.statusPill}>
          <input type="number" min={1} max={60} value={p.durationMonths}
            onChange={(e) => p.setDurationMonths(e.target.value)}
            placeholder="6" style={ringStyle(durState.border)} />
        </Field>
        <Field label={t.startDateLabel} hint={t.startDateHint} status={startState.statusPill}>
          <input type="date" value={p.startDate}
            onChange={(e) => p.setStartDate(e.target.value)}
            style={ringStyle(startState.border)} />
        </Field>
      </div>

      <Field label={t.reqSkillsLabel} hint={t.reqSkillsHint} status={reqState.statusPill}>
        <TagInput tags={p.reqSkills} onChange={p.setReqSkills} placeholder={t.reqSkillsPlaceholder}
          borderColor={reqState.border} />
      </Field>

      <Field label={t.niceSkillsLabel} hint={t.optional} status={niceState.statusPill}>
        <TagInput tags={p.niceSkills} onChange={p.setNiceSkills} placeholder={t.niceSkillsPlaceholder}
          borderColor={niceState.border} />
      </Field>

      {/* Salaire cible du poste — UNIVERSEL (indépendant de la Suite Pricing).
          Toutes les équipes de sourcing en ont besoin : il sert de repère et
          se compare à la prétention du candidat sur la fiche match. */}
      <Field label={t.targetSalaryLabel} hint={t.optional} status={brutState.statusPill}>
        <input type="number" min={0} value={p.targetBrut}
          onChange={(e) => p.setTargetBrut(e.target.value)} placeholder={t.targetSalaryPlaceholder} style={ringStyle(brutState.border)} />
      </Field>

      {/* Bloc pricing (zone / TJM) — uniquement pour les orgs avec accès
          pricing. Repliable : c'est un détail que le sourceur ouvre au besoin. */}
      {p.hasPricing && (
        <details style={{
          background: "#FAF9FE", border: "1px solid #EDE8FA", borderRadius: 12,
          padding: "12px 14px",
        }}>
          <summary style={{ cursor: "pointer", fontSize: 12.5, fontWeight: 700, color: "#6B54B2", listStyle: "none" }}>
            {t.pricingDetails} <span style={{ color: "#6B7280", fontWeight: 500 }}>{t.pricingSuiteOnly}</span>
          </summary>
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
            <Field label={t.pricingZoneLabel} hint={t.pricingZoneHint} status={pricingState.statusPill}>
              <Select value={p.pricingLieu} onChange={(v) => p.setPricingLieu(v as PricingLieu | "")}
                border={pricingState.border} placeholder={t.notSet}
                options={(Object.keys(t.lieuLabels) as PricingLieu[]).map((k) => ({ value: k, label: t.lieuLabels[k] }))} />
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <Field label={t.tjmMinLabel} hint={t.optional} status={tjmMinState.statusPill}>
                <input type="number" min={0} value={p.tjmMin}
                  onChange={(e) => p.setTjmMin(e.target.value)} placeholder={t.tjmMinPlaceholder} style={ringStyle(tjmMinState.border)} />
              </Field>
              <Field label={t.tjmMaxLabel} hint={t.optional} status={tjmMaxState.statusPill}>
                <input type="number" min={0} value={p.tjmMax}
                  onChange={(e) => p.setTjmMax(e.target.value)} placeholder={t.tjmMaxPlaceholder} style={ringStyle(tjmMaxState.border)} />
              </Field>
            </div>
          </div>
        </details>
      )}

      <Field label={t.descriptionLabel} hint={t.descriptionHint} status={descState.statusPill}>
        <textarea value={p.description} onChange={(e) => p.setDescription(e.target.value)}
          rows={3} placeholder={t.descriptionPlaceholder}
          style={{ ...ringStyle(descState.border), resize: "vertical", lineHeight: 1.6 }} />
      </Field>
    </>
  )
}

/* ── Bordures par état ── */
const BORDER = {
  ok:       "#22C55E",   // vert
  required: "#EF4444",   // rouge — obligatoire manquant
  optional: "#F59E0B",   // orange — facultatif manquant
} as const

/* StyledSelect partagé dans @/components/ui/StyledSelect. */

function StatusPill({ kind, children }: { kind: "ok" | "missing" | "review"; children: React.ReactNode }) {
  const map = {
    ok:      { bg: "rgba(34,197,94,0.10)",  fg: "#15803d", bd: "rgba(34,197,94,0.25)" },
    missing: { bg: "rgba(239,68,68,0.08)",  fg: "#B91C1C", bd: "rgba(239,68,68,0.22)" },
    review:  { bg: "rgba(245,158,11,0.10)", fg: "#B45309", bd: "rgba(245,158,11,0.25)" },
  }[kind]
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, color: map.fg,
      background: map.bg, border: `1px solid ${map.bd}`,
      padding: "2px 7px", borderRadius: 100,
      textTransform: "uppercase", letterSpacing: "0.05em",
    }}>
      {children}
    </span>
  )
}

function Field({ label, hint, status, children }: { label: string; hint?: string; status?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span>{label}</span>
        {hint && <span style={{ fontWeight: 400, color: "#6B7280" }}>· {hint}</span>}
        {status}
      </span>
      {children}
    </label>
  )
}

const inputStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box",
  fontSize: 13.5, color: "#111827",
  padding: "9px 12px",
  background: "#FAFAFA", border: "1px solid #E5E7EB", borderRadius: 9,
  outline: "none", fontFamily: "inherit",
}

function TagInput({ tags, onChange, placeholder, borderColor }: { tags: string[]; onChange: (t: string[]) => void; placeholder?: string; borderColor?: string }) {
  const [draft, setDraft] = useState("")
  const commit = () => {
    const v = draft.trim().replace(/,$/, "").trim()
    if (v && !tags.some((t) => t.toLowerCase() === v.toLowerCase())) {
      onChange([...tags, v])
    }
    setDraft("")
  }
  return (
    <div style={{
      display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center",
      padding: "7px 9px", background: "#FAFAFA",
      border: `1px solid ${borderColor ?? "#E5E7EB"}`, borderRadius: 9, minHeight: 38,
    }}>
      {tags.map((t) => (
        <span key={t} style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          fontSize: 12, color: "#4B5563",
          background: "white", border: "1px solid #F0ECF8",
          padding: "3px 6px 3px 9px", borderRadius: 6,
        }}>
          {t}
          <button onClick={() => onChange(tags.filter((x) => x !== t))} style={{
            background: "transparent", border: "none", cursor: "pointer",
            color: "#6B7280", fontSize: 13, lineHeight: 1, padding: 0,
          }}>✕</button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => {
          const val = e.target.value
          if (val.endsWith(",")) { setDraft(val); commit() }
          else setDraft(val)
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit() }
          if (e.key === "Backspace" && !draft && tags.length) onChange(tags.slice(0, -1))
        }}
        onBlur={commit}
        placeholder={tags.length === 0 ? placeholder : ""}
        style={{
          flex: 1, minWidth: 100, border: "none", outline: "none",
          background: "transparent", fontSize: 13, color: "#111827", fontFamily: "inherit",
        }}
      />
    </div>
  )
}
