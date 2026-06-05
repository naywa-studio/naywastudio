/**
 * POST /api/subscribe
 *
 * Legacy endpoint kept as a no-op for the workspace home auto-grant call.
 * In the org model, every signed-in user already has an organization
 * created by the on_auth_user_created trigger (migration 020), with
 * `package_sourcing_active = true` by default. This route just confirms
 * that state so the workspace UI can keep its "first-visit grant" loop
 * happy.
 *
 * Once we wire Stripe, this is the entry point to flip
 * `package_sourcing_active` on after a successful checkout.
 */

import { NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import type { Database } from "@/lib/database.types"

export async function POST() {
  const cookieStore = await cookies()
  const sb = createServerClient<Database>(
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim(),
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim(),
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          for (const { name, value, options } of toSet) {
            cookieStore.set(name, value, options)
          }
        },
      },
    }
  )

  const { data: { user } } = await sb.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
  }

  const { data: profile } = await sb
    .from("profiles")
    .select("organization_id")
    .eq("user_id", user.id)
    .single()

  if (!profile?.organization_id) {
    return NextResponse.json({ error: "No organization" }, { status: 409 })
  }

  return NextResponse.json({ ok: true, organization_id: profile.organization_id })
}
