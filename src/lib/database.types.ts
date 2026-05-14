// Generated-style type definition compatible with @supabase/supabase-js v2
// Sprint 1 — CV CRM (Naywa Studio / Nora)

export type WorkspaceMsg = {
  id: string
  role: 'user' | 'assistant'
  content: string
}

// ── Parsed CV structure (LLM output) ──────────────────────────────────────────
export type ParsedExperience = {
  title: string
  company: string
  start?: string         // "YYYY-MM" or "YYYY"
  end?: string | null    // null when current
  location?: string
  description?: string
  highlights?: string[]
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
  current_title?: string | null
  current_company?: string | null
  years_experience?: number | null
  seniority_level?: string | null
  summary?: string | null
  skills?: string[]
  languages?: string[]
  experience?: ParsedExperience[]
  education?: ParsedEducation[]
  certifications?: string[]
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
      cv_upload_quota: {
        Row: {
          user_id: string
          day: string
          uploads: number
        }
        Insert: {
          user_id: string
          day?: string
          uploads?: number
        }
        Update: Partial<Database['public']['Tables']['cv_upload_quota']['Insert']>
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}

// ── Aliases métier ────────────────────────────────────────────────────────────
export type Profile = Database['public']['Tables']['profiles']['Row']
export type Job = Database['public']['Tables']['jobs']['Row']
export type Candidate = Database['public']['Tables']['candidates']['Row']
export type MatchAssessment = Database['public']['Tables']['match_assessments']['Row']

export type JobStatus = Job['status']
export type ParseStatus = Candidate['parse_status']
export type PipelineStage = MatchAssessment['pipeline_stage']
export type MatchTier = NonNullable<MatchAssessment['match_tier']>
