import { createBrowserClient } from "@supabase/ssr"
import type { Database } from "./database.types"

// Browser client — uses cookie storage so the middleware can read the session.
// createBrowserClient returns the same instance when called with the same URL/key.
export function getSupabase() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
