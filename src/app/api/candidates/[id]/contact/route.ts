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

  const { data: candidate, error: fetchErr } = await sb
    .from("candidates")
    .select("id, user_id, contacted_at")
    .eq("id", candidateId)
    .single()

  if (fetchErr || !candidate) {
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 })
  }

  if (candidate.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Idempotent: toggle — if already contacted, unmark; if not, mark
  const now = candidate.contacted_at ? null : new Date().toISOString()
  const { error: updateErr } = await sb
    .from("candidates")
    .update({ contacted_at: now })
    .eq("id", candidateId)

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, contacted_at: now })
}
