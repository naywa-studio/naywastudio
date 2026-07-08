/**
 * POST /api/sectors/classify-vivier
 *
 * Nora classe les candidats NON classés (sector_status='to_review' ou sans
 * secteur) contre les secteurs de l'org. Action explicite du sourceur depuis
 * le vivier ("Classer le vivier"). Bornée par run pour maîtriser le budget LLM
 * — relançable pour traiter le reste.
 *
 * Ne repasse JAMAIS sur les candidats déjà 'validated' (choix humain) ni 'auto'
 * (déjà classés par Nora). Seuls les "à classer" sont traités.
 */

import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getAdminSupabase } from "@/lib/admin-supabase"
import { consumeOrgLlmActionForUser } from "@/lib/quota"
import { classifySectors } from "@/lib/sector-classify"
import { CANDIDATE_COLUMNS, type Candidate } from "@/lib/database.types"

export const runtime = "nodejs"
export const maxDuration = 120

// Plafond haut : on veut tout classer en un clic (56-150 CV passent largement
// sous le maxDuration 120 avec concurrence 5 et le mode décisif). Au-delà, on
// renvoie remaining=-1 et le sourceur relance.
const MAX_PER_RUN = 150
const CONCURRENCY = 5

export async function POST() {
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  const { data: profile } = await sb
    .from("profiles").select("organization_id").eq("user_id", user.id).maybeSingle()
  if (!profile?.organization_id) {
    return NextResponse.json({ error: "no_organization" }, { status: 400 })
  }

  // Candidats à classer : parsés, statut 'to_review'. (Les 'auto' et
  // 'validated' portent déjà un classement — on n'y touche pas.)
  const { data: candRows } = await sb
    .from("candidates")
    .select(CANDIDATE_COLUMNS)
    .eq("parse_status", "parsed")
    .eq("sector_status", "to_review")
    .limit(MAX_PER_RUN + 1)
  const candidates = (candRows ?? []) as unknown as Candidate[]
  const hasMore = candidates.length > MAX_PER_RUN
  const batch = candidates.slice(0, MAX_PER_RUN)

  if (batch.length === 0) {
    return NextResponse.json({ ok: true, classified: 0, remaining: 0 })
  }

  const { data: sectorRows } = await sb.from("sectors").select("name, description")
  const known = (sectorRows ?? []).map((s) => ({ name: s.name, description: s.description }))

  const admin = getAdminSupabase()
  let classified = 0

  const processOne = async (c: Candidate) => {
    // Un crédit LLM org par candidat classé.
    const orgLlm = await consumeOrgLlmActionForUser(admin, user.id)
    if (!orgLlm.ok) return
    const parsed = c.parsed_cv
    const cls = await classifySectors({
      current_title: c.current_title,
      current_company: c.current_company,
      years_experience: c.years_experience,
      skills: c.skills,
      summary: parsed?.summary ?? null,
    }, known, { decisive: true })
    // On ne bascule en 'auto' que si Nora a trouvé quelque chose ; sinon on
    // laisse 'to_review' (jamais un secteur au petit bonheur).
    if (cls.sectors.length > 0) {
      await admin.from("candidates").update({
        sectors: cls.sectors,
        sector_status: cls.status,
      }).eq("id", c.id)
      classified++
    }
  }

  const queue = [...batch]
  const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    while (queue.length > 0) {
      const next = queue.shift()
      if (!next) return
      await processOne(next)
    }
  })
  await Promise.all(workers)

  return NextResponse.json({ ok: true, classified, remaining: hasMore ? -1 : 0 })
}
