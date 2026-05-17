// Generated-style type definition compatible with @supabase/supabase-js v2
// Sprint 1 — CV CRM (Naywa Studio / Nora)

export type WorkspaceMsg = {
  id: string
  role: 'user' | 'assistant'
  content: string
}

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
          sector: string | null
          need: string | null
          budget: string | null
          agent_name: string | null
          agent_price: string | null
          subscription_level: 'leo' | 'nora' | 'alex' | null
          subscribed_at: string | null
          booking_url: string | null
          vps_id: string | null
          vps_ip: string | null
          vps_status: 'pending' | 'provisioning' | 'ready' | 'error' | null
          agent_status: 'not_deployed' | 'deploying' | 'running' | 'error'
          workspace_memory: string | null
          workspace_messages: WorkspaceMsg[] | null
          apify_credits_used: number
          apify_reset_at: string
          inbox_address: string | null
          inbox_cc_self: boolean
          calendly_access_token: string | null
          calendly_refresh_token: string | null
          calendly_token_expires_at: string | null
          calendly_user_uri: string | null
          calendly_org_uri: string | null
          calendly_event_type_uri: string | null
          calendly_scheduling_url: string | null
          calendly_webhook_uri: string | null
          calendly_connected_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: Partial<Database['public']['Tables']['profiles']['Row']> & { user_id: string }
        Update: Partial<Database['public']['Tables']['profiles']['Row']>
        Relationships: []
      }
      jobs: {
        Row: {
          id: string
          user_id: string
          title: string
          location: string | null
          seniority: string | null
          contract_type: string | null
          required_skills: string[] | null
          nice_to_have_skills: string[] | null
          description: string | null
          brief: Record<string, unknown> | null
          normalized: JobNormalized | null
          status: 'draft' | 'open' | 'filled' | 'archived'
          match_status: 'idle' | 'matching' | 'done' | 'error'
          matched_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          location?: string | null
          seniority?: string | null
          contract_type?: string | null
          required_skills?: string[] | null
          nice_to_have_skills?: string[] | null
          description?: string | null
          brief?: Record<string, unknown> | null
          normalized?: JobNormalized | null
          status?: 'draft' | 'open' | 'filled' | 'archived'
          match_status?: 'idle' | 'matching' | 'done' | 'error'
          matched_at?: string | null
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
          full_name: string | null
          email: string | null
          phone: string | null
          location: string | null
          linkedin_url: string | null
          current_title: string | null
          current_company: string | null
          years_experience: number | null
          seniority_level: string | null
          skills: string[] | null
          languages: string[] | null
          parsed_cv: ParsedCv | null
          taxonomy: CandidateTaxonomy | null
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
          created_at: string
          updated_at: string
          consulted_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          full_name?: string | null
          email?: string | null
          phone?: string | null
          location?: string | null
          linkedin_url?: string | null
          current_title?: string | null
          current_company?: string | null
          years_experience?: number | null
          seniority_level?: string | null
          skills?: string[] | null
          languages?: string[] | null
          parsed_cv?: ParsedCv | null
          taxonomy?: CandidateTaxonomy | null
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
          created_at?: string
          updated_at?: string
          consulted_at?: string | null
        }
        Update: Partial<Database['public']['Tables']['candidates']['Insert']>
        Relationships: []
      }
      match_assessments: {
        Row: {
          id: string
          user_id: string
          candidate_id: string
          job_id: string
          score: number | null
          score_dimensions: ScoreDimensions | null
          justification: string | null
          match_tier: 'excellent' | 'good' | 'fair' | 'poor' | null
          pipeline_stage: 'identified' | 'contacted' | 'replied' | 'interview' | 'offer' | 'hired' | 'rejected'
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
          candidate_id: string
          job_id: string
          score?: number | null
          score_dimensions?: ScoreDimensions | null
          justification?: string | null
          match_tier?: 'excellent' | 'good' | 'fair' | 'poor' | null
          pipeline_stage?: 'identified' | 'contacted' | 'replied' | 'interview' | 'offer' | 'hired' | 'rejected'
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
          day: string
          action: string
          count: number
        }
        Insert: {
          user_id: string
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
      interviews: {
        Row: {
          id: string
          user_id: string
          candidate_id: string | null
          job_id: string | null
          match_id: string | null
          calendly_event_uri: string
          calendly_invitee_uri: string | null
          status: 'scheduled' | 'canceled'
          start_time: string
          end_time: string
          location_type: string | null
          join_url: string | null
          location_text: string | null
          invitee_name: string | null
          invitee_email: string | null
          canceled_at: string | null
          cancel_reason: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          candidate_id?: string | null
          job_id?: string | null
          match_id?: string | null
          calendly_event_uri: string
          calendly_invitee_uri?: string | null
          status?: 'scheduled' | 'canceled'
          start_time: string
          end_time: string
          location_type?: string | null
          join_url?: string | null
          location_text?: string | null
          invitee_name?: string | null
          invitee_email?: string | null
          canceled_at?: string | null
          cancel_reason?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['interviews']['Insert']>
        Relationships: [
          {
            foreignKeyName: 'interviews_candidate_id_fkey'
            columns: ['candidate_id']
            isOneToOne: false
            referencedRelation: 'candidates'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'interviews_job_id_fkey'
            columns: ['job_id']
            isOneToOne: false
            referencedRelation: 'jobs'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'interviews_match_id_fkey'
            columns: ['match_id']
            isOneToOne: false
            referencedRelation: 'match_assessments'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      bump_usage: {
        Args: { p_user: string; p_action: string }
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
  "skills, languages, parsed_cv, taxonomy, cv_file_path, cv_file_name, " +
  "cv_file_size, cv_mime_type, anonymized_pdf_path, anonymized_at, " +
  "outreach_draft, outreach_meta, parse_status, parse_error, parsed_at, " +
  "notes, tags, created_at, updated_at, consulted_at"

// ── Aliases métier ────────────────────────────────────────────────────────────
export type Profile = Database['public']['Tables']['profiles']['Row']
export type Job = Database['public']['Tables']['jobs']['Row']
export type Candidate = Database['public']['Tables']['candidates']['Row']
export type MatchAssessment = Database['public']['Tables']['match_assessments']['Row']
export type EmailMessage = Database['public']['Tables']['email_messages']['Row']
export type Interview = Database['public']['Tables']['interviews']['Row']

export type JobStatus = Job['status']
export type ParseStatus = Candidate['parse_status']
export type PipelineStage = MatchAssessment['pipeline_stage']
export type MatchTier = NonNullable<MatchAssessment['match_tier']>
export type EmailDirection = EmailMessage['direction']
export type EmailSentiment = NonNullable<EmailMessage['ai_sentiment']>
export type InterviewStatus = Interview['status']
