// Generated-style type definition compatible with @supabase/supabase-js v2
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
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          first_name?: string | null
          sector?: string | null
          need?: string | null
          budget?: string | null
          agent_name?: string | null
          agent_price?: string | null
          subscription_level?: 'leo' | 'nora' | 'alex' | null
          subscribed_at?: string | null
          booking_url?: string | null
          vps_id?: string | null
          vps_ip?: string | null
          vps_status?: 'pending' | 'provisioning' | 'ready' | 'error' | null
          agent_status?: 'not_deployed' | 'deploying' | 'running' | 'error'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          first_name?: string | null
          sector?: string | null
          need?: string | null
          budget?: string | null
          agent_name?: string | null
          agent_price?: string | null
          subscription_level?: 'leo' | 'nora' | 'alex' | null
          subscribed_at?: string | null
          booking_url?: string | null
          vps_id?: string | null
          vps_ip?: string | null
          vps_status?: 'pending' | 'provisioning' | 'ready' | 'error' | null
          agent_status?: 'not_deployed' | 'deploying' | 'running' | 'error'
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      missions: {
        Row: {
          id: string
          user_id: string
          title: string
          status: 'preparation' | 'in_progress' | 'completed' | 'error'
          agent_level: 'leo' | 'nora' | null
          brief: MissionBrief | null
          profiles_count: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          status?: 'preparation' | 'in_progress' | 'completed' | 'error'
          agent_level?: 'leo' | 'nora' | null
          brief?: MissionBrief | null
          profiles_count?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          title?: string
          status?: 'preparation' | 'in_progress' | 'completed' | 'error'
          agent_level?: 'leo' | 'nora' | null
          brief?: MissionBrief | null
          profiles_count?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      candidates: {
        Row: {
          id: string
          mission_id: string
          user_id: string
          linkedin_url: string | null
          name_estimated: string | null
          title_estimated: string | null
          company: string | null
          keywords: string[] | null
          relevance_score: number | null
          score_justification: string | null
          status: 'raw' | 'shortlisted' | 'rejected'
          message_draft: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          mission_id: string
          user_id: string
          linkedin_url?: string | null
          name_estimated?: string | null
          title_estimated?: string | null
          company?: string | null
          keywords?: string[] | null
          relevance_score?: number | null
          score_justification?: string | null
          status?: 'raw' | 'shortlisted' | 'rejected'
          message_draft?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          mission_id?: string
          user_id?: string
          linkedin_url?: string | null
          name_estimated?: string | null
          title_estimated?: string | null
          company?: string | null
          keywords?: string[] | null
          relevance_score?: number | null
          score_justification?: string | null
          status?: 'raw' | 'shortlisted' | 'rejected'
          message_draft?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      booking_links: {
        Row: {
          id: string
          candidate_id: string
          mission_id: string
          token: string
          status: 'pending' | 'reserved' | 'done'
          created_at: string
        }
        Insert: {
          id?: string
          candidate_id: string
          mission_id: string
          token?: string
          status?: 'pending' | 'reserved' | 'done'
          created_at?: string
        }
        Update: {
          id?: string
          candidate_id?: string
          mission_id?: string
          token?: string
          status?: 'pending' | 'reserved' | 'done'
          created_at?: string
        }
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      get_booking_by_token: {
        Args: { p_token: string }
        Returns: Array<{
          id: string
          token: string
          status: string
          mission_id: string
          mission_title: string
          candidate_id: string
          candidate_name: string | null
          recruiter_name: string | null
          booking_url: string | null
        }>
      }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}

// ── Types métier dérivés ──────────────────────────────────────────────────────

export type MissionBrief = {
  titre_poste: string
  mots_cles: string[]
  localisation: string
  criteres?: string
  ton?: string
  nom_recruteur?: string
}

export type Profile = Database['public']['Tables']['profiles']['Row']
export type Mission = Database['public']['Tables']['missions']['Row']
export type Candidate = Database['public']['Tables']['candidates']['Row']
export type BookingLink = Database['public']['Tables']['booking_links']['Row']

export type VpsStatus = Profile['vps_status']
export type AgentStatus = Profile['agent_status']
export type MissionStatus = Mission['status']
export type AgentLevel = NonNullable<Mission['agent_level']>
export type CandidateStatus = Candidate['status']
