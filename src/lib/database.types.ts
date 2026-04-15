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
          status: 'preparation' | 'in_progress' | 'completed'
          brief: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          status?: 'preparation' | 'in_progress' | 'completed'
          brief?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          title?: string
          status?: 'preparation' | 'in_progress' | 'completed'
          brief?: string | null
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
          company: string | null
          keywords: string[] | null
          score: number | null
          status: 'new' | 'qualified' | 'contacted' | 'rejected'
          message_draft: string | null
          created_at: string
        }
        Insert: {
          id?: string
          mission_id: string
          user_id: string
          linkedin_url?: string | null
          name_estimated?: string | null
          company?: string | null
          keywords?: string[] | null
          score?: number | null
          status?: 'new' | 'qualified' | 'contacted' | 'rejected'
          message_draft?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          mission_id?: string
          user_id?: string
          linkedin_url?: string | null
          name_estimated?: string | null
          company?: string | null
          keywords?: string[] | null
          score?: number | null
          status?: 'new' | 'qualified' | 'contacted' | 'rejected'
          message_draft?: string | null
          created_at?: string
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
    Functions: { [_ in never]: never }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}
