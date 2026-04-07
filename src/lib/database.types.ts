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
          created_at?: string
          updated_at?: string
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
