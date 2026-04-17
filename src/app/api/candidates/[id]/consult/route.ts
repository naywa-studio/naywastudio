import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import type { Database } from "@/lib/database.types"

export async function PATCH(
  _req: NextRequest,
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
          try {
            toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch {}
        },
      },
    }
  )

  const { data: { user }, error: authErr } = await sb.auth.getUser()
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Verify the candidate belongs to this user
  const { data: candidate, error: fetchErr } = await sb
    .from("candidates")
    .select("id, user_id, consulted_at")
    .eq("id", candidateId)
    .single()

  if (fetchErr || !candidate) {
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 })
  }

  if (candidate.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Idempotent: only set if not already consulted
  if (candidate.consulted_at) {
    return NextResponse.json({ ok: true, consulted_at: candidate.consulted_at })
  }

  const now = new Date().toISOString()
  const { error: updateErr } = await sb
    .from("candidates")
    .update({ consulted_at: now })
    .eq("id", candidateId)

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, consulted_at: now })
}
