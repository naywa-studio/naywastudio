import { createClient } from "@supabase/supabase-js"
import type { Database } from "./database.types"

/**
 * Service-role Supabase client. **Server-only.**
 * Bypasses RLS — use for trusted server-side operations only,
 * after the caller's identity has been verified through the user-scoped client.
 */
export function getAdminSupabase() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim()
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim()
  if (!url || !key) throw new Error("Supabase admin credentials missing")
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
