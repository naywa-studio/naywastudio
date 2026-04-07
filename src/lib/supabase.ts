import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "./database.types"

// Lazy singleton — avoids throwing at module-import time during SSR/build
// when env vars are not yet set. The client is only instantiated in the browser.
let _client: SupabaseClient<Database> | null = null

export function getSupabase(): SupabaseClient<Database> {
  if (!_client) {
    _client = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }
  return _client
}
