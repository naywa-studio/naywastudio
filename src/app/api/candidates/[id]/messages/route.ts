/**
 * GET /api/candidates/:id/messages
 *
 * Le fil d'échange avec un candidat : ce qui est parti, ce qui est revenu.
 *
 * ── Pourquoi cette route existe seulement maintenant ─────────────────────
 *
 * Les réponses des candidats arrivaient en base depuis longtemps, et **rien ne
 * les affichait**. Le sourceur voyait partir ses messages et jamais revenir
 * les réponses — au point de croire qu'un candidat ne répondait pas alors que
 * Nora avait déjà lu son « oui » et suggéré un entretien.
 *
 * ── Ce que cette route ne renvoie PAS ────────────────────────────────────
 *
 * `body_html`. Le contenu d'un email entrant n'est ni authentifié ni de
 * confiance : le rendre en HTML dans le workspace serait une injection de
 * script offerte à quiconque connaît l'adresse de réception d'un sourceur.
 * Le texte brut dit la même chose et ne peut rien exécuter.
 */

import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import type { StoredAttachment } from "@/lib/mailing/attachments"

export const runtime = "nodejs"

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  // Le candidat est lu via le client RLS : un identifiant appartenant à une
  // autre organisation ne renvoie simplement rien. Le cloisonnement ne dépend
  // donc pas d'un filtre que ce fichier pourrait oublier.
  const { data: candidate } = await sb
    .from("candidates").select("id").eq("id", id).maybeSingle()
  if (!candidate) return NextResponse.json({ error: "not_found" }, { status: 404 })

  const jobId = req.nextUrl.searchParams.get("job_id")

  let query = sb
    .from("email_messages")
    .select("id, direction, from_address, to_address, subject, body_text, status, error, ai_sentiment, ai_summary, ai_suggested_stage, attachments, job_id, created_at")
    .eq("candidate_id", id)
    .order("created_at", { ascending: true })
    .limit(200)

  /* Filtrer par mission, mais garder les messages SANS mission.
   *
   * Une réponse n'hérite du contexte que si un message sortant l'a précédée.
   * Les exclure ferait disparaître du fil les toutes premières réponses —
   * précisément celles qu'on attend le plus. */
  if (jobId) query = query.or(`job_id.eq.${jobId},job_id.is.null`)

  const { data, error } = await query
  if (error) {
    console.error("[candidates/messages] lecture impossible:", error.message)
    return NextResponse.json({ error: "read_failed", detail: "internal_error" }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    messages: (data ?? []).map((m) => ({
      ...m,
      // On n'expose que le nom et la taille : le chemin R2 est une adresse
      // interne, et le publier inviterait à le manipuler.
      attachments: ((m.attachments ?? []) as StoredAttachment[]).map((a) => ({
        filename: a.filename, size: a.size, contentType: a.contentType,
      })),
    })),
  })
}
