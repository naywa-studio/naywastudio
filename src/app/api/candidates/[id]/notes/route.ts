/**
 * PATCH /api/candidates/[id]/notes
 * Saves recruiter notes for a candidate owned by the authenticated user.
 */

import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { createClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"
import type { Database } from "@/lib/database.types"

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: candidateId } = await params
  const cookieStore = await cookies()
  const sb = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try { toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {}
        },
      },
    }
  )

  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json() as { notes: string }
  if (typeof body.notes !== "string") {
    return NextResponse.json({ error: "Invalid body: notes must be a string" }, { status: 400 })
  }

  // Verify the candidate belongs to the authenticated user
  const { data: candidate } = await sb
    .from("candidates")
    .select("id")
    .eq("id", candidateId)
    .eq("user_id", user.id)
    .single()

  if (!candidate) return NextResponse.json({ error: "Candidate not found" }, { status: 404 })

  // Update notes using service role to bypass RLS
  const sbAdmin = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { error } = await sbAdmin
    .from("candidates")
    .update({ notes: body.notes })
    .eq("id", candidateId)

  if (error) return NextResponse.json({ error: "Database error" }, { status: 500 })

  return NextResponse.json({ ok: true })
}
