import { createBrowserClient } from "@supabase/ssr"
import type { Database } from "./database.types"

// Browser client — uses cookie storage so the middleware can read the session.
// createBrowserClient returns the same instance when called with the same URL/key.
export function getSupabase() {
  // Trim because Vercel env vars sometimes carry a trailing newline that
  // breaks the Realtime WebSocket apikey query param.
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim()
  const key = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim()
  return createBrowserClient<Database>(url, key)
}
