// Generated-style type definition compatible with @supabase/supabase-js v2
// Sprint 1 — CV CRM (Naywa Studio / Nora)

import type { Criterion, CriterionEval } from "./job-criteria-catalog"

// ── Parsed CV structure (LLM output) ──────────────────────────────────────────
export type ExperienceSeniority = 'stage' | 'junior' | 'mid' | 'senior' | 'lead' | 'principal'

export type ParsedExperience = {
  title: string
  company: string
  start?: string         // "YYYY-MM" or "YYYY"
  end?: string | null    // null when current
  location?: string
  description?: string
  highlights?: string[]
  seniority?: ExperienceSeniority | null   // seniority held during this specific role
  /** True if this experience is in the same role family as the dominant role.
   *  Used to compute "seniority in the dominant role" rather than absolute years. */
  counts_toward_role?: boolean
}

export type ParsedEducation = {
  degree: string
  school: string
  field?: string
  start?: string
  end?: string
}

export type ParsedCv = {
  full_name?: string | null
  email?: string | null
  phone?: string | null
  location?: string | null
  linkedin_url?: string | null
  github_url?: string | null
  portfolio_url?: string | null
  malt_url?: string | null
  current_title?: string | null
  current_company?: string | null
  years_experience?: number | null
  seniority_level?: string | null
  /** Dominant role family the seniority applies to (e.g. "Data Engineer"). */
  seniority_role?: string | null
  /** True if the candidate is currently in alternance / apprentissage /
   *  contrat de professionnalisation. Drives the "Alternant" badge in
   *  the UI and excludes the current experience from years_experience. */
  is_apprentice?: boolean
  summary?: string | null
  /** Technical / verifiable skills (SQL, Agile, AWS…). Max 30. */
  skills?: string[]
  /** Human traits / soft skills (rigueur, leadership…). Max 15. */
  qualities?: string[]
  languages?: string[]
  experience?: ParsedExperience[]
  education?: ParsedEducation[]
  certifications?: string[]
  /** Detected primary language of the CV (ISO 639-1: "fr", "en", "es", …). */
  language?: string | null
  /** High-level industry/sector the candidate belongs to (closed list). */
  sector?: 'tech' | 'finance' | 'retail' | 'sante' | 'industrie' | 'conseil' | 'marketing' | 'rh' | 'public' | 'education' | 'autre' | null
  /** 0-100 — how complete the CV looks (based on filled fields). */
  completeness?: number | null
  /** Free-form alerts surfaced to the sourcer (gaps, contradictions…). */
  warnings?: string[]
  // For OCR fallback / future flags
  source_quality?: 'native' | 'scanned' | 'partial'
}

export type ScoreDimensions = {
  skills_match?: number
  seniority_fit?: number
  location_fit?: number
  experience_fit?: number
  language_fit?: number
  [key: string]: number | undefined
}

// ── Cluster assignment — produit par Nora lors d'un passage de clustering
// du vivier. Un candidat a 1 à 3 entries (rarement 4). Les labels sont libres,
// déterminés holistiquement par Nora à partir de tout le vivier.
export interface ClusterAssignment {
  /** Libellé du cluster (libre, défini par Nora pour le vivier courant). */
  label: string
  /** 0.5 à 1.0 — poids du candidat dans ce cluster. 1.0 = cœur de cible. */
  weight: number
}

// ── Taxonomy: multi-axis tag set produced at parse time, enriched by matching ──
export type CandidateTaxonomy = {
  role_family?: string[]      // ["Data Engineer", "ML Engineer"]
  domains?: string[]          // ["fintech", "e-commerce"]
  industries?: string[]       // ["banque", "retail"]
  tools?: string[]            // ["AWS", "Spark", "Airflow"]
  core_skills?: string[]      // matching-relevant skills (noise removed)
  seniority?: string | null   // "junior" | "mid" | "senior" | "lead" | "principal"
  mission_tags?: string[]     // normalized concepts from matched jobs, accumulates
}

// ── Job normalized shape — matching-ready, LLM-extracted at job creation ──
export type JobNormalized = {
  role_family?: string[]
  must_have_skills?: string[]
  nice_to_have_skills?: string[]
  domains?: string[]
  seniority?: string | null
  summary?: string | null
  /** Experience interval captured on the mission form (years). The matching
   *  `seniority` above is derived from the midpoint of this interval. */
  seniority_min_years?: number | null
  seniority_max_years?: number | null
}

// ── Pricing defaults stored on profiles.pricing_default_avantages ──
export type PricingDefaultAvantages = {
  ticketsResto?: number
  mutuellePremium?: number
  transport?: number
  forfaitMobilite?: number
  treiziemeMois?: boolean
  primeCooptationAnnuelle?: number
  /** URSSAF indemnité grand déplacement, €/jour travaillé. Plafonds 2026 :
   *  Paris+PC ≈ 117,10 €/j, autres zones ≈ 97,90 €/j. */
  urssafIndemniteJour?: number
  /** Médecine du travail — forfait annuel cotisation SST (obligation légale).
   *  Coût typique 80-150 €/an/salarié, mensualisé /12. */
  medecineDuTravailAnnuel?: number
  /** Indemnité kilométrique annuelle estimée — si véhicule personnel pour
   *  déplacements pro. Mensualisé /12. */
  indemniteKilometriqueAnnuelle?: number
  /** Indemnité d'expatriation mensuelle — pour mission expatrié. */
  expatriationMensuelle?: number
  autresMensuels?: number
}

// ── Compose IA: metadata for the persisted outreach draft ──
export type OutreachChannel = "email" | "linkedin"
export type OutreachMeta = {
  channel: OutreachChannel
  job_id?: string | null
  job_title?: string | null
  instruction?: string | null
  subject?: string | null
  generated_at: string
}

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          user_id: string
          first_name: string | null
          /** FK → organizations.id. Set by the on_auth_user_created trigger,
           *  every authenticated user always belongs to exactly one org. */
          organization_id: string
          role: 'owner' | 'member'
          /** True iff this profile occupies one of the org sourcing seats.
           *  Owners default to false (admin-only); invitees default to true.
           *  /workspace access is gated on this column. */
          has_sourcing_seat: boolean
          inbox_address: string | null
          inbox_cc_self: boolean
          /** Set quand cet utilisateur a complété/skippé la visite
           *  guidée Package Sourcing sur /workspace (per-user, indépendant
           *  du flag org). NULL = la modale s'ouvre au prochain accès. */
          package_sourcing_onboarded_at: string | null
          /** True iff ce compte est un admin Naywa (transverse aux
           *  organisations). Donne accès à /admin et bypasse les
           *  gates de paiement / siège. Élevé manuellement en SQL. */
          is_admin: boolean
          /** Langue préférée du site (fr/en), choisie via le sélecteur de
           *  langue. Fallback localStorage pour les visiteurs non connectés. */
          preferred_language: 'fr' | 'en'
          /** Capacités déléguées NOMMÉMENT par l'owner à un membre (migration
           *  065). Chacune est accordable indépendamment. Un owner n'a PAS
           *  besoin de ces colonnes : il tient tous les droits de son rôle
           *  (cf. getCapabilities). Aucune de ces caps n'ouvre la facturation,
           *  les sièges payés, le transfert de propriété, la suppression ni
           *  l'octroi de droits — tout cela reste strictement owner. */
          /** Gère l'identité & le branding (logo, couleurs, slogan, email de
           *  contact + demandes de changement des champs verrouillés). */
          can_manage_branding: boolean
          /** Gère la politique commerciale (marges, jours facturables, défauts
           *  TJM/lieu/modalité/avantages). */
          can_manage_pricing: boolean
          /** Gère l'équipe (inviter, attribuer un siège DÉJÀ payé, retirer un
           *  membre). Non exposé en V1 (owner-only en pratique) ; la colonne
           *  existe pour brancher la délégation plus tard sans migration. */
          can_manage_team: boolean
          /** Acceptation des CGU (clickwrap). NULL = jamais accepté → bannière
           *  de rappel. Écrites côté serveur (auditable). Cf. lib/cgu.ts. */
          cgu_accepted_at: string | null
          cgu_version: string | null
          created_at: string
          updated_at: string
        }
        Insert: Partial<Database['public']['Tables']['profiles']['Row']> & { user_id: string }
        Update: Partial<Database['public']['Tables']['profiles']['Row']>
        Relationships: []
      }
      organizations: {
        Row: {
          id: string
          name: string
          owner_user_id: string | null
          brand_name: string | null
          brand_logo_path: string | null
          /** Couleur primaire hex (#RRGGBB) du cabinet pour le PDF
           *  anonymisé. NULL = défaut applicatif noir "off" (#000000),
           *  pour forcer l'owner à configurer sa propre couleur. */
          brand_color: string | null
          /** Couleur secondaire hex (#RRGGBB), optionnelle. Utilisée
           *  dans le PDF pour les titres de section et accents (bicolore).
           *  NULL = pas de bicolore, on reste sur brand_color partout. */
          brand_color_secondary: string | null
          /** Slogan optionnel affiché sous le nom du cabinet sur le
           *  PDF anonymisé. */
          brand_slogan: string | null
          /** Mail générique du cabinet, imprimé en pied de page du PDF
           *  anonymisé pour permettre au client final de recontacter
           *  au sujet du candidat présenté. */
          contact_email: string | null
          seats_total: number
          /** Cabinet outbound mailing domain (eg "cabinet-dupont.com"). NULL =
           *  shared Naywa transactional domain. UI masks this field until the
           *  Resend per-cabinet domain wiring ships. */
          mailing_domain: string | null
          /** When set, the cron will wipe this org and all its data at this
           *  timestamp. Members keep access until then; owner is already gone. */
          pending_deletion_at: string | null
          // Pricing cabinet-wide defaults — single source of truth going
          // forward. The legacy mirrors on `profiles` are kept temporarily
          // until every read path moves here.
          pricing_billable_days_per_month: number | null
          pricing_margin_min_pct: number | null
          pricing_margin_target_pct: number | null
          pricing_default_lieu: 'paris_petite_couronne' | 'idf_grande_couronne' | 'lyon' | 'province' | null
          pricing_default_modalite: 'modalite_1' | 'modalite_2' | 'modalite_3' | null
          pricing_default_avantages: PricingDefaultAvantages | null
          pricing_onboarded_at: string | null
          pricing_rtt_days_per_year: number
          /** When the 15-day free trial expires. NULL = owner hasn't activated
           *  yet. Set to now() + 15 days when the owner clicks "Activer mon
           *  essai" in onboarding. */
          trial_ends_at: string | null
          /** Set when the owner finishes the /cabinet/onboarding flow (whether
           *  they activated the trial or not). Drives the redirect : while
           *  NULL the owner is pushed to /cabinet/onboarding on every visit. */
          cabinet_onboarded_at: string | null
          /** Stripe Customer ID, created on first Checkout and reused after.
           *  NULL = the owner has never reached the Checkout step. */
          stripe_customer_id: string | null
          /** Stripe Subscription ID, active or fully canceled. */
          stripe_subscription_id: string | null
          /** Mirror of stripe.subscription.status. NULL = never subscribed. */
          subscription_status:
            | 'trialing' | 'active' | 'past_due' | 'canceled'
            | 'unpaid' | 'incomplete' | 'incomplete_expired' | 'paused'
            | null
          /** lookup_key of the active price (sourcing_1..4, sourcing_pro_1..4). */
          subscription_price_lookup: string | null
          /** Number of seats the cabinet is paying for. */
          subscription_seats: number | null
          /** True if the active plan is the Pro variant (Suite Pricing Syntec). */
          subscription_has_pricing: boolean
          subscription_cancel_at_period_end: boolean
          /** End of the currently paid Stripe billing period. */
          current_period_end: string | null
          /** When the org entered read-only mode (past_due / unpaid /
           *  canceled). Daily cron wipes data at +15 days. NULL = active. */
          lockdown_started_at: string | null
          /** Set quand l'owner a complété ou skippé la visite guidée
           *  Package Sourcing post-souscription. NULL = la bannière
           *  reminder s'affiche sur /organisation. */
          package_sourcing_onboarded_at: string | null
          /** Verrouillage anti-fraude des champs "identité forte"
           *  (logo, nom, contact_email). Stamp à cabinet_onboarded_at
           *  + 24h. Après cette date, la modification passe par une
           *  demande validée par un admin Naywa (cf. table
           *  branding_change_requests). NULL = pas encore verrouillé. */
          branding_locked_at: string | null
          /** Stockage R2 utilisé (recalc nightly via cron). */
          storage_used_bytes: number
          /** Actions LLM consommées sur le mois en cours.
           *  Reset le 1er via /api/cron/reset-llm-quota. */
          llm_actions_this_month: number
          /** Début du mois en cours (filet si le cron de reset rate
           *  un mois — check quota le reset à la volée). */
          llm_period_start: string
          /** Override custom des quotas — { cv, storage_gb, llm_monthly }.
           *  `cv` = capacité vivier custom (plafond visible client). Les deux
           *  autres restent en filet interne. NULL = quotas dérivés du plan.
           *  Set par admin Naywa. */
          quota_override_json: { cv?: number; storage_gb?: number; llm_monthly?: number } | null
          created_at: string
          updated_at: string
        }
        Insert: Partial<Database['public']['Tables']['organizations']['Row']> & { name: string }
        Update: Partial<Database['public']['Tables']['organizations']['Row']>
        Relationships: []
      }
      org_invites: {
        Row: {
          id: string
          organization_id: string
          email: string
          token: string
          role: 'owner' | 'member'
          invited_by: string | null
          expires_at: string
          accepted_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          email: string
          token?: string
          role?: 'owner' | 'member'
          invited_by?: string | null
          expires_at?: string
          accepted_at?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['org_invites']['Row']>
        Relationships: []
      }
      trial_consumed_emails: {
        Row: {
          email: string
          consumed_at: string
          organization_id: string | null
          notes: string | null
        }
        Insert: {
          email: string
          consumed_at?: string
          organization_id?: string | null
          notes?: string | null
        }
        Update: Partial<Database['public']['Tables']['trial_consumed_emails']['Row']>
        Relationships: []
      }
      cluster_manifests: {
        Row: {
          id: string
          organization_id: string
          label: string
          /** Short "qui ressemble à ça" — proposée par Nora au 1er run
           *  ou rédigée par le sourceur. Re-lue à chaque clustering pour
           *  guider l'assignment. */
          description: string
          candidate_count: number
          /** True si la zone a été proposée par Nora au 1er run (ou la
           *  zone système "Autre"). False si créée manuellement par le
           *  sourceur via POST /api/vivier/zones. */
          is_seed: boolean
          /** Trace qui a créé la zone manuellement. NULL pour seed/system. */
          created_by_user_id: string | null
          /** Ordre d'affichage UI (modifiable par le sourceur). */
          display_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          label: string
          description: string
          candidate_count?: number
          is_seed?: boolean
          created_by_user_id?: string | null
          display_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['cluster_manifests']['Row']>
        Relationships: []
      }
      jobs: {
        Row: {
          id: string
          user_id: string
          /** FK → organizations.id. Set automatically on insert. */
          organization_id: string
          title: string
          role_name: string | null
          location: string | null
          seniority: string | null
          contract_type: string | null
          required_skills: string[] | null
          nice_to_have_skills: string[] | null
          description: string | null
          brief: Record<string, unknown> | null
          briefing: string | null
          /** Brief brut du client (appel d'offre / cahier des charges), optionnel.
           *  Distinct de `briefing` (brief saisi par le sourceur). */
          client_brief: string | null
          normalized: JobNormalized | null
          status: 'draft' | 'open' | 'filled' | 'archived'
          match_status: 'idle' | 'matching' | 'done' | 'error'
          matched_at: string | null
          /** Taille du pool après pré-filtre, set au début d'un run.
           *  Permet à l'UI de calculer une vraie barre de progression
           *  (`scored / total` au lieu du temps écoulé). NULL hors d'un run actif. */
          match_progress_total: number | null
          /** Compteur incrémenté après chaque batch persisté. NULL hors d'un run actif. */
          match_progress_scored: number | null
          // Mission pricing — client-side commercial inputs (sprint Pricing).
          // `location` and `contract_type` above already carry the "lieu de
          // mission" and "type de contrat" so we don't duplicate them here.
          client_tjm_min: number | null
          client_tjm_max: number | null
          margin_min_pct: number | null
          margin_target_pct: number | null
          duration_months: number | null
          target_gross_salary: number | null
          start_date: string | null
          /** Lieu typé pour les calculs pricing (plafond URSSAF, transport).
           *  Indépendant de `location` qui reste un texte libre saisi à la
           *  création de la mission. */
          pricing_lieu: 'paris_petite_couronne' | 'idf_grande_couronne' | 'lyon' | 'province' | null
          /** Mission avec grand déplacement → applique le tarif URSSAF cabinet. */
          has_grand_deplacement: boolean
          /** Mission expatriée → applique la prime expatriation cabinet. */
          is_expatriated: boolean
          /** True si le contrat de mission prévoit explicitement le
           *  renouvellement de la période d'essai (Article 3.4 Syntec : pas
           *  automatique, accord écrit requis). Défaut false → seule la durée
           *  initiale est appliquée dans le chart Risque rupture. */
          essai_renouvele: boolean
          /** Critères flexibles choisis par Nora + validés par le sourceur (PR-Z).
           *  NULL avant l'onboarding critères. Cf. lib/job-criteria-catalog.ts. */
          criteria: Criterion[] | null
          /** Timestamp de validation des critères par le sourceur. NULL = onboarding
           *  pas fait, l'UI montre le wizard. */
          criteria_locked_at: string | null
          /** Secteurs cibles de la mission (par nom), définis à l'onboarding.
           *  Gate le "Matcher le vivier" en mode Intelligent. */
          target_sectors: string[]
          /** Dernier mode de match choisi (mémo pour repartir vite). */
          last_match_mode: 'intelligent' | 'personnalise' | 'complet' | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          organization_id?: string
          title: string
          role_name?: string | null
          location?: string | null
          seniority?: string | null
          contract_type?: string | null
          required_skills?: string[] | null
          nice_to_have_skills?: string[] | null
          description?: string | null
          brief?: Record<string, unknown> | null
          briefing?: string | null
          client_brief?: string | null
          normalized?: JobNormalized | null
          status?: 'draft' | 'open' | 'filled' | 'archived'
          match_status?: 'idle' | 'matching' | 'done' | 'error'
          matched_at?: string | null
          match_progress_total?: number | null
          match_progress_scored?: number | null
          client_tjm_min?: number | null
          client_tjm_max?: number | null
          margin_min_pct?: number | null
          margin_target_pct?: number | null
          duration_months?: number | null
          target_gross_salary?: number | null
          start_date?: string | null
          pricing_lieu?: 'paris_petite_couronne' | 'idf_grande_couronne' | 'lyon' | 'province' | null
          has_grand_deplacement?: boolean
          is_expatriated?: boolean
          essai_renouvele?: boolean
          criteria?: Criterion[] | null
          criteria_locked_at?: string | null
          target_sectors?: string[]
          last_match_mode?: 'intelligent' | 'personnalise' | 'complet' | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['jobs']['Insert']>
        Relationships: []
      }
      candidates: {
        Row: {
          id: string
          user_id: string
          organization_id: string
          full_name: string | null
          email: string | null
          phone: string | null
          location: string | null
          linkedin_url: string | null
          current_title: string | null
          current_company: string | null
          years_experience: number | null
          seniority_level: string | null
          /** True if currently in alternance/apprentissage — drives the UI badge. */
          is_apprentice: boolean
          skills: string[] | null
          languages: string[] | null
          parsed_cv: ParsedCv | null
          taxonomy: CandidateTaxonomy | null
          /** Assignations de clusters produites par Nora lors d'un passage
           *  de clustering du vivier. NULL = pas encore classé. */
          cluster_assignments: ClusterAssignment[] | null
          cluster_assigned_at: string | null
          raw_text: string | null
          search_tsv: unknown
          cv_file_path: string | null
          cv_file_name: string | null
          cv_file_size: number | null
          cv_mime_type: string | null
          anonymized_pdf_path: string | null
          anonymized_at: string | null
          outreach_draft: string | null
          outreach_meta: OutreachMeta | null
          parse_status: 'pending' | 'parsing' | 'parsed' | 'error' | 'manual'
          parse_error: string | null
          parsed_at: string | null
          notes: string | null
          tags: string[] | null
          /** Secteurs du candidat (par nom). Multi-secteur (profils hybrides). */
          sectors: string[]
          /** auto = proposé Nora non validé · to_review = à classer · validated
           *  = confirmé humain. to_review/vide → jamais exclu du matching. */
          sector_status: 'auto' | 'to_review' | 'validated'
          created_at: string
          updated_at: string
          consulted_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          organization_id?: string
          full_name?: string | null
          email?: string | null
          phone?: string | null
          location?: string | null
          linkedin_url?: string | null
          current_title?: string | null
          current_company?: string | null
          years_experience?: number | null
          seniority_level?: string | null
          is_apprentice?: boolean
          skills?: string[] | null
          languages?: string[] | null
          parsed_cv?: ParsedCv | null
          taxonomy?: CandidateTaxonomy | null
          cluster_assignments?: ClusterAssignment[] | null
          cluster_assigned_at?: string | null
          raw_text?: string | null
          cv_file_path?: string | null
          cv_file_name?: string | null
          cv_file_size?: number | null
          cv_mime_type?: string | null
          anonymized_pdf_path?: string | null
          anonymized_at?: string | null
          outreach_draft?: string | null
          outreach_meta?: OutreachMeta | null
          parse_status?: 'pending' | 'parsing' | 'parsed' | 'error' | 'manual'
          parse_error?: string | null
          parsed_at?: string | null
          notes?: string | null
          tags?: string[] | null
          sectors?: string[]
          sector_status?: 'auto' | 'to_review' | 'validated'
          created_at?: string
          updated_at?: string
          consulted_at?: string | null
        }
        Update: Partial<Database['public']['Tables']['candidates']['Insert']>
        Relationships: []
      }
      sectors: {
        Row: {
          id: string
          organization_id: string
          name: string
          /** Définition courte (validée par le sourceur), réinjectée dans le
           *  classement Nora pour un rangement cohérent dans le temps. */
          description: string | null
          created_by: 'user' | 'nora'
          created_at: string
        }
        Insert: {
          id?: string
          organization_id?: string
          name: string
          description?: string | null
          created_by?: 'user' | 'nora'
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['sectors']['Insert']>
        Relationships: []
      }
      match_assessments: {
        Row: {
          id: string
          user_id: string
          organization_id: string
          candidate_id: string
          job_id: string
          score: number | null
          score_dimensions: ScoreDimensions | null
          justification: string | null
          match_tier: 'excellent' | 'good' | 'fair' | 'poor' | null
          /** Provenance du match — voir migration 053.
           *  - applied         : candidature spontanée (formulaire public E2)
           *  - uploaded        : CV déposé directement sur la fiche mission (E1)
           *  - vivier_matched  : remonté par le matching auto
           *  - vivier_assigned : assigné manuellement depuis le vivier
           */
          source: 'applied' | 'uploaded' | 'vivier_matched' | 'vivier_assigned'
          /** Évaluation par critère pour ce (candidat × mission). Remplace
           *  progressivement score_dimensions. Voir lib/job-criteria-catalog.ts. */
          criteria_eval: CriterionEval[] | null
          pipeline_stage: 'identified' | 'pricing' | 'contacted' | 'replied' | 'interview' | 'offer' | 'hired' | 'rejected'
          /** true = candidat suivi dans la pipeline (ajout explicite ou contact
           *  auto). false = simple résultat de matching, non affiché en pipeline. */
          in_pipeline: boolean
          /** Derniers réglages pricing pour ce (candidat × mission). NULL = jamais
           *  ajusté ; le widget retombe alors sur job.client_tjm_min /
           *  job.target_gross_salary comme valeur de départ. */
          pricing_tjm: number | null
          pricing_brut: number | null
          /** Prétention salariale du candidat (brut annuel €) pour cette mission.
           *  Universelle (hors Suite Pricing) — saisie sur la fiche match, se
           *  compare à jobs.target_gross_salary. NULL = non renseignée. */
          salary_expectation_brut: number | null
          /** Per-match override of the avantages. NULL → cabinet defaults. */
          pricing_avantages_override: PricingDefaultAvantages | null
          /** Raison du rejet quand pipeline_stage = rejected. NULL sinon. */
          reject_reason: 'too_expensive' | 'not_available' | 'wrong_stack' | 'seniority_mismatch' | 'location_mismatch' | 'other' | null
          /** Note libre du sourceur, optionnelle (utile quand reject_reason=other). */
          reject_reason_note: string | null
          contacted_at: string | null
          replied_at: string | null
          interview_at: string | null
          booking_token: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          organization_id?: string
          candidate_id: string
          job_id: string
          score?: number | null
          score_dimensions?: ScoreDimensions | null
          justification?: string | null
          match_tier?: 'excellent' | 'good' | 'fair' | 'poor' | null
          source?: 'applied' | 'uploaded' | 'vivier_matched' | 'vivier_assigned'
          criteria_eval?: CriterionEval[] | null
          pipeline_stage?: 'identified' | 'pricing' | 'contacted' | 'replied' | 'interview' | 'offer' | 'hired' | 'rejected'
          in_pipeline?: boolean
          pricing_tjm?: number | null
          pricing_brut?: number | null
          salary_expectation_brut?: number | null
          pricing_avantages_override?: PricingDefaultAvantages | null
          reject_reason?: 'too_expensive' | 'not_available' | 'wrong_stack' | 'seniority_mismatch' | 'location_mismatch' | 'other' | null
          reject_reason_note?: string | null
          contacted_at?: string | null
          replied_at?: string | null
          interview_at?: string | null
          booking_token?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['match_assessments']['Insert']>
        Relationships: [
          {
            foreignKeyName: 'match_assessments_candidate_id_fkey'
            columns: ['candidate_id']
            isOneToOne: false
            referencedRelation: 'candidates'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'match_assessments_job_id_fkey'
            columns: ['job_id']
            isOneToOne: false
            referencedRelation: 'jobs'
            referencedColumns: ['id']
          },
        ]
      }
      daily_usage: {
        Row: {
          user_id: string
          organization_id: string
          day: string
          action: string
          count: number
        }
        Insert: {
          user_id: string
          organization_id?: string
          day?: string
          action: string
          count?: number
        }
        Update: Partial<Database['public']['Tables']['daily_usage']['Insert']>
        Relationships: []
      }
      email_messages: {
        Row: {
          id: string
          user_id: string
          organization_id: string
          candidate_id: string | null
          job_id: string | null
          direction: 'outbound' | 'inbound'
          from_address: string
          to_address: string
          subject: string | null
          body_text: string | null
          body_html: string | null
          provider_id: string | null
          status: 'sent' | 'delivered' | 'received' | 'failed' | 'bounced'
          error: string | null
          ai_sentiment: 'interested' | 'not_interested' | 'question' | 'neutral' | 'negotiation' | null
          ai_summary: string | null
          ai_suggested_stage: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          organization_id?: string
          candidate_id?: string | null
          job_id?: string | null
          direction: 'outbound' | 'inbound'
          from_address: string
          to_address: string
          subject?: string | null
          body_text?: string | null
          body_html?: string | null
          provider_id?: string | null
          status?: 'sent' | 'delivered' | 'received' | 'failed' | 'bounced'
          error?: string | null
          ai_sentiment?: 'interested' | 'not_interested' | 'question' | 'neutral' | 'negotiation' | null
          ai_summary?: string | null
          ai_suggested_stage?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['email_messages']['Insert']>
        Relationships: [
          {
            foreignKeyName: 'email_messages_candidate_id_fkey'
            columns: ['candidate_id']
            isOneToOne: false
            referencedRelation: 'candidates'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'email_messages_job_id_fkey'
            columns: ['job_id']
            isOneToOne: false
            referencedRelation: 'jobs'
            referencedColumns: ['id']
          },
        ]
      }
      app_updates: {
        Row: {
          id: string
          title: string
          body: string
          /** Catégorie pastillée dans l'UI :
           *  - 'feature'   : nouvelle fonctionnalité
           *  - 'fix'       : correctif
           *  - 'important' : info importante / breaking
           *  - 'announce'  : annonce générale */
          category: 'feature' | 'fix' | 'important' | 'announce'
          /** NULL = brouillon. <= now() = visible. > now() = planifié. */
          published_at: string | null
          author_user_id: string | null
          /** Zones de l'app concernées (paths exact-match) :
           *  ['/workspace/vivier', '/organisation']. Utilisé pour
           *  afficher une pastille violette par item de menu sidebar.
           *  Vide = pastille globale "Nouveautés" uniquement. */
          affected_paths: string[]
          created_at: string
          updated_at: string
        }
        Insert: Partial<Database['public']['Tables']['app_updates']['Row']> & {
          title: string; body: string
        }
        Update: Partial<Database['public']['Tables']['app_updates']['Row']>
        Relationships: []
      }
      app_updates_reads: {
        Row: {
          user_id: string
          update_id: string
          read_at: string
        }
        Insert: { user_id: string; update_id: string; read_at?: string }
        Update: Partial<Database['public']['Tables']['app_updates_reads']['Row']>
        Relationships: []
      }
      admin_audit_log: {
        Row: {
          id: string
          admin_user_id: string | null
          /** Action métier snake_case : search_users, view_user,
           *  view_organization, list_branding_requests, approve_branding_request,
           *  reject_branding_request, publish_update, delete_update, ... */
          action: string
          target_type: string | null
          target_id: string | null
          metadata: Record<string, unknown>
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['admin_audit_log']['Row']> & {
          admin_user_id: string; action: string
        }
        Update: Partial<Database['public']['Tables']['admin_audit_log']['Row']>
        Relationships: []
      }
      branding_change_requests: {
        Row: {
          id: string
          organization_id: string
          requested_by: string | null
          /** Champ ciblé par la demande. */
          field: 'name' | 'brand_logo_path' | 'contact_email'
          current_value: string | null
          requested_value: string
          reason: string | null
          status: 'pending' | 'approved' | 'rejected' | 'cancelled'
          decided_by: string | null
          decided_at: string | null
          decision_note: string | null
          /** Regroupement des rows d'une même soumission (l'owner a
           *  coché plusieurs champs dans un seul formulaire). Chaque
           *  row reste décidable indépendamment. Defaulte à
           *  gen_random_uuid() côté DB pour les demandes mono-champ. */
          request_batch_id: string
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['branding_change_requests']['Row']> & {
          organization_id: string; field: 'name' | 'brand_logo_path' | 'contact_email'; requested_value: string
        }
        Update: Partial<Database['public']['Tables']['branding_change_requests']['Row']>
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      bump_usage: {
        Args: { p_user: string; p_action: string }
        Returns: number
      }
      // Insert atomique d'une candidate sous le plafond CV (verrou par-org).
      // Lève cv_quota_exceeded si la limite est atteinte.
      insert_candidate_if_under_cv_quota: {
        Args: {
          p_user_id: string
          p_org_id: string
          p_cv_file_name: string
          p_cv_file_size: number
          p_cv_mime_type: string
          p_cv_limit: number
        }
        Returns: Database["public"]["Tables"]["candidates"]["Row"]
      }
      // Increment conditionnel atomique du compteur LLM mensuel d'une org.
      // Retourne le nouveau total, ou null si la limite est déjà atteinte.
      consume_org_llm_quota: {
        Args: { p_org_id: string; p_limit: number }
        Returns: number
      }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}

// ── Query helpers ─────────────────────────────────────────────────────────────
/**
 * Every candidate column EXCEPT `raw_text` (the full extracted PDF text,
 * ~24 KB/row) and `search_tsv` — neither is ever rendered client-side.
 * Use this instead of `select("*")` on candidate reads to keep payloads small.
 */
export const CANDIDATE_COLUMNS =
  "id, user_id, full_name, email, phone, location, linkedin_url, " +
  "current_title, current_company, years_experience, seniority_level, " +
  "skills, languages, parsed_cv, taxonomy, cluster_assignments, cluster_assigned_at, " +
  "cv_file_path, cv_file_name, " +
  "cv_file_size, cv_mime_type, anonymized_pdf_path, anonymized_at, " +
  "outreach_draft, outreach_meta, parse_status, parse_error, parsed_at, " +
  "notes, tags, sectors, sector_status, created_at, updated_at, consulted_at"

// ── Aliases métier ────────────────────────────────────────────────────────────
export type Profile = Database['public']['Tables']['profiles']['Row']
export type Organization = Database['public']['Tables']['organizations']['Row']
export type OrgInvite = Database['public']['Tables']['org_invites']['Row']
export type OrgRole = Profile['role']
export type Job = Database['public']['Tables']['jobs']['Row']
export type Candidate = Database['public']['Tables']['candidates']['Row']
export type Sector = Database['public']['Tables']['sectors']['Row']
export type SectorStatus = Candidate['sector_status']
export type MatchAssessment = Database['public']['Tables']['match_assessments']['Row']
export type EmailMessage = Database['public']['Tables']['email_messages']['Row']
export type AppUpdate = Database['public']['Tables']['app_updates']['Row']
export type AppUpdateRead = Database['public']['Tables']['app_updates_reads']['Row']
export type AdminAuditLog = Database['public']['Tables']['admin_audit_log']['Row']
export type BrandingChangeRequest = Database['public']['Tables']['branding_change_requests']['Row']
export type AppUpdateCategory = AppUpdate['category']
export type BrandingChangeField = BrandingChangeRequest['field']
export type BrandingChangeStatus = BrandingChangeRequest['status']

export type JobStatus = Job['status']
export type ParseStatus = Candidate['parse_status']
export type PipelineStage = MatchAssessment['pipeline_stage']
export type MatchTier = NonNullable<MatchAssessment['match_tier']>
export type EmailDirection = EmailMessage['direction']
export type EmailSentiment = NonNullable<EmailMessage['ai_sentiment']>
