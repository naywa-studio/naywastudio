/**
 * GET /api/match/:id
 *
 * Renvoie le match_assessment + le candidat (colonnes UI) + le poste
 * joints en un seul appel. Sert principalement de feeder à la nouvelle
 * fiche match `/workspace/match/[matchId]` qui agrège tout au même endroit.
 *
 * RLS-scoped read: si le match n'appartient pas au user, on renvoie 404.
 */

import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { requireActiveAccess } from "@/lib/access-guard"
import { CANDIDATE_COLUMNS } from "@/lib/database.types"
import { sanitizeClientRejectReasons } from "@/lib/client-reject-reasons"
import { sanitizeClientLikedReasons } from "@/lib/client-liked-reasons"
import { readSelection, isEmptySelection, readOrder, isEmptyOrder, type AnonymizeSelection } from "@/lib/anonymize-selection"

export const runtime = "nodejs"

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  const { data: match, error } = await sb
    .from("match_assessments")
    .select(`
      id, user_id, candidate_id, job_id,
      score, score_dimensions, criteria_eval, justification, match_tier, source,
      pipeline_stage, in_pipeline, contacted_at, replied_at, interview_at,
      salary_expectation_brut,
      client_feedback_note, client_feedback_at,
      anonymize_excluded, anonymize_order, anonymize_custom_text,
      booking_token, created_at, updated_at,
      job:jobs(*)
    `)
    .eq("id", id)
    .single()

  if (error || !match) return NextResponse.json({ error: "not_found" }, { status: 404 })

  const { data: candRow } = await sb
    .from("candidates")
    .select(CANDIDATE_COLUMNS)
    .eq("id", match.candidate_id)
    .single()
  if (!candRow) return NextResponse.json({ error: "candidate_not_found" }, { status: 404 })

  return NextResponse.json({ match, candidate: candRow })
}

/**
 * PATCH /api/match/:id
 *
 * Met à jour des champs UNIVERSELS du match (indépendants de la Suite
 * Pricing) : prétention salariale + retour client (segment cabinet/ESN).
 * Le VERDICT client (présenté/recruté/écarté) vit dans pipeline_stage
 * (route /stage) ; ici on ne gère que le retour libre du client.
 * Field-allowlist stricte + RLS-scoped (le client Supabase server est
 * org-scopé → un match d'une autre org ne matchera pas).
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })
  const gate = await requireActiveAccess()
  if (!gate.ok) return gate.response

  const body = await req.json().catch(() => null) as Record<string, unknown> | null

  // Allowlist stricte : prétention salariale + retour client. On ignore tout
  // autre champ du body.
  const update: {
    salary_expectation_brut?: number | null
    client_feedback_note?: string | null
    client_feedback_at?: string | null
    client_reject_reasons?: string[] | null
    client_liked_reasons?: string[] | null
    client_positive_note?: string | null
    client_positive_at?: string | null
    anonymized_at?: string | null
    anonymize_excluded?: AnonymizeSelection | null
    anonymize_order?: AnonymizeSelection | null
    anonymize_custom_text?: string | null
  } = {}

  if (body && "salary_expectation_brut" in body) {
    const v = body.salary_expectation_brut
    if (v === null || v === "") {
      update.salary_expectation_brut = null
    } else {
      const n = typeof v === "number" ? v : Number(v)
      if (!Number.isFinite(n) || n < 0) {
        return NextResponse.json({ error: "invalid_salary" }, { status: 400 })
      }
      update.salary_expectation_brut = Math.round(n)
    }
  }

  // Retour / motif libre du client (borné, ou null pour effacer). Horodatage
  // auto à chaque changement.
  if (body && "client_feedback_note" in body) {
    const v = body.client_feedback_note
    if (v === null || v === "") {
      update.client_feedback_note = null
      update.client_feedback_at = null
    } else if (typeof v === "string") {
      update.client_feedback_note = v.slice(0, 2000)
      update.client_feedback_at = new Date().toISOString()
    } else {
      return NextResponse.json({ error: "invalid_note" }, { status: 400 })
    }
  }

  // Motifs d'écart CLIENT (multi, universels). Validés contre le catalogue.
  if (body && "client_reject_reasons" in body) {
    const v = body.client_reject_reasons
    const reasons = v == null ? null : sanitizeClientRejectReasons(v)
    update.client_reject_reasons = reasons
    // Horodate le retour client dès qu'un motif est posé (au même titre que le
    // commentaire libre) — sert à Nora pour ne re-proposer un réajustement que
    // sur du retour PLUS RÉCENT que le dernier appliqué. On ne l'écrase pas si
    // le commentaire l'a déjà posé dans le même PATCH.
    if (reasons && reasons.length > 0 && update.client_feedback_at === undefined) {
      update.client_feedback_at = new Date().toISOString()
    }
  }

  // Retour POSITIF libre du client (ce qui a plu sur un candidat retenu).
  // Borné, ou null pour effacer. Horodatage auto à chaque changement.
  if (body && "client_positive_note" in body) {
    const v = body.client_positive_note
    if (v === null || v === "") {
      update.client_positive_note = null
      update.client_positive_at = null
    } else if (typeof v === "string") {
      update.client_positive_note = v.slice(0, 2000)
      update.client_positive_at = new Date().toISOString()
    } else {
      return NextResponse.json({ error: "invalid_note" }, { status: 400 })
    }
  }

  // Motifs POSITIFS client (multi, universels). Validés contre le catalogue.
  if (body && "client_liked_reasons" in body) {
    const v = body.client_liked_reasons
    const reasons = v == null ? null : sanitizeClientLikedReasons(v)
    update.client_liked_reasons = reasons
    // Horodate le retour positif dès qu'un motif est posé, sauf si le commentaire
    // positif l'a déjà fait dans le même PATCH.
    if (reasons && reasons.length > 0 && update.client_positive_at === undefined) {
      update.client_positive_at = new Date().toISOString()
    }
  }

  // Retrait de la Revue client : on efface le marqueur d'appartenance.
  if (body && body.clear_review === true) {
    update.anonymized_at = null
  }

  // Briques masquées dans le CV anonymisé DE CETTE MISSION. `readSelection`
  // ne laisse passer que des chaînes bornées, dédupliquées et plafonnées : le
  // client ne peut pas faire enfler la colonne. Une sélection vide revient à
  // NULL — on ne stocke pas un objet qui ne dit rien.
  if (body && "anonymize_excluded" in body) {
    const sel = readSelection(body.anonymize_excluded)
    update.anonymize_excluded = isEmptySelection(sel) ? null : sel
  }

  // Ordre des briques, même mission. Colonne séparée de l'exclusion : masquer
  // et réordonner sont deux gestes indépendants, et les fusionner obligerait à
  // réécrire l'ensemble à chaque clic.
  if (body && "anonymize_order" in body) {
    const order = readOrder(body.anonymize_order)
    update.anonymize_order = isEmptyOrder(order) ? null : order
  }

  // Message d'accompagnement, PAR CANDIDAT depuis la migration 084. Il vivait
  // sur la mission et se retrouvait donc sous les douze profils d'une même
  // shortlist, alors qu'un angle éditorial ne vaut que pour une personne.
  if (body && "anonymize_custom_text" in body) {
    const v = body.anonymize_custom_text
    if (v === null || v === "") {
      update.anonymize_custom_text = null
    } else if (typeof v === "string") {
      update.anonymize_custom_text = v.slice(0, 600)
    } else {
      return NextResponse.json({ error: "invalid_custom_text" }, { status: 400 })
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "no_op" }, { status: 400 })
  }

  const { data, error } = await sb
    .from("match_assessments")
    .update(update)
    .eq("id", id)
    .select("id, salary_expectation_brut, client_feedback_note, client_feedback_at, client_reject_reasons, client_liked_reasons, client_positive_note, client_positive_at, anonymized_at, anonymize_excluded, anonymize_order")
    .single()
  if (error || !data) return NextResponse.json({ error: "not_found" }, { status: 404 })

  return NextResponse.json({ ok: true, match: data })
}
