/**
 * PATCH /api/candidates/:id/parsed-cv — édition manuelle de la fiche.
 * DELETE — retour à la version d'origine produite par Nora.
 *
 * Le sourceur corrige ce que le parsing a mal lu : une date, un intitulé, une
 * description, un poste oublié ou en double. Sans ça, il n'avait AUCUN recours
 * face à une fiche erronée — et « Nous traitons, vous décidez » n'était vrai
 * qu'à moitié.
 *
 * TROIS GARDE-FOUS, dans cet ordre :
 *
 *  1. `requireActiveAccess` — même barrière que toutes les mutations.
 *  2. Lecture via le client RLS : un candidat d'une autre organisation est
 *     invisible, donc renvoie 404. Le cloisonnement client tient même pour un
 *     admin Naywa.
 *  3. ALLOWLIST DE CHAMPS. On ne fait JAMAIS `{...parsed_cv, ...body}` : un
 *     spread laisserait le client injecter n'importe quelle clé dans le JSON,
 *     y compris `source_quality` ou des champs qu'on ajouterait demain.
 *
 * INSTANTANÉ D'ORIGINE : la toute première modification recopie `parsed_cv`
 * dans `parsed_cv_original`. Les suivantes n'y touchent plus — on garde ce que
 * NORA avait produit, pas l'avant-dernière retouche du sourceur. C'est cette
 * version-là qu'il veut retrouver quand il annule.
 */

import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getAdminSupabase } from "@/lib/admin-supabase"
import { requireActiveAccess } from "@/lib/access-guard"
import type { ParsedCv, ParsedExperience, ParsedEducation, ParsedSection } from "@/lib/database.types"

export const runtime = "nodejs"

/** Bornes de saisie. Généreuses — il s'agit de corriger un CV réel, pas de
 *  brider le sourceur — mais fermées : sans plafond, un copier-coller
 *  malheureux ferait gonfler indéfiniment une ligne de la base. */
const MAX_TEXT = 400
const MAX_DESC = 2_000
const MAX_SUMMARY = 2_000
const MAX_LIST = 60
const MAX_EXPERIENCES = 40
const MAX_EDUCATION = 20
const MAX_SECTIONS = 12

const str = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null
  const t = v.trim()
  return t.length ? t.slice(0, max) : null
}

const list = (v: unknown, cap = MAX_LIST): string[] =>
  Array.isArray(v)
    ? v.map((x) => String(x).trim()).filter(Boolean).map((s) => s.slice(0, MAX_TEXT)).slice(0, cap)
    : []

/** Date "YYYY" ou "YYYY-MM" uniquement. Toute autre saisie devient null :
 *  mieux vaut une date absente qu'une date que le calcul de séniorité et le
 *  matching liront de travers. */
function cleanDate(v: unknown): string | undefined {
  if (v === null) return undefined
  if (typeof v !== "string") return undefined
  const t = v.trim()
  if (!t) return undefined
  return /^\d{4}(-(0[1-9]|1[0-2]))?$/.test(t) ? t : undefined
}

function cleanExperiences(raw: unknown): ParsedExperience[] {
  if (!Array.isArray(raw)) return []
  const out: ParsedExperience[] = []
  for (const item of raw) {
    const e = item as Record<string, unknown> | null
    const title = str(e?.title, MAX_TEXT) ?? ""
    const company = str(e?.company, MAX_TEXT) ?? ""
    if (!title && !company) continue
    // `end: null` explicite = poste EN COURS ; absent = date de fin inconnue.
    // La nuance vient du parsing et l'édition doit la préserver, sinon un
    // poste terminé repasserait pour le poste actuel du candidat.
    const endRaw = e?.end
    out.push({
      title,
      company,
      start: cleanDate(e?.start),
      end: endRaw === null ? null : cleanDate(endRaw),
      location: str(e?.location, MAX_TEXT) ?? undefined,
      description: str(e?.description, MAX_DESC) ?? undefined,
      seniority: null,
      counts_toward_role: e?.counts_toward_role !== false,
    })
    if (out.length >= MAX_EXPERIENCES) break
  }
  return out
}

function cleanEducation(raw: unknown): ParsedEducation[] {
  if (!Array.isArray(raw)) return []
  const out: ParsedEducation[] = []
  for (const item of raw) {
    const ed = item as Record<string, unknown> | null
    const degree = str(ed?.degree, MAX_TEXT) ?? ""
    const school = str(ed?.school, MAX_TEXT) ?? ""
    if (!degree && !school) continue
    out.push({
      degree,
      school,
      field: str(ed?.field, MAX_TEXT) ?? undefined,
      start: cleanDate(ed?.start),
      end: cleanDate(ed?.end),
    })
    if (out.length >= MAX_EDUCATION) break
  }
  return out
}

function cleanSections(raw: unknown): ParsedSection[] {
  if (!Array.isArray(raw)) return []
  const out: ParsedSection[] = []
  for (const item of raw) {
    const s = item as Record<string, unknown> | null
    const title = str(s?.title, 80)
    const content = str(s?.content, 800)
    if (!title || !content) continue
    out.push({ title, content })
    if (out.length >= MAX_SECTIONS) break
  }
  return out
}

/**
 * Applique les champs autorisés sur le CV existant.
 *
 * Chaque clé absente du corps est LAISSÉE INTACTE : le sourceur qui corrige
 * une date ne doit pas effacer les compétences au passage. Une clé présente
 * remplace intégralement sa valeur.
 */
function applyEditableFields(current: ParsedCv, body: Record<string, unknown>): ParsedCv {
  const next: ParsedCv = { ...current }
  if ("summary" in body) next.summary = str(body.summary, MAX_SUMMARY)
  if ("full_name" in body) next.full_name = str(body.full_name, MAX_TEXT)
  if ("email" in body) next.email = str(body.email, MAX_TEXT)?.toLowerCase() ?? null
  if ("phone" in body) next.phone = str(body.phone, MAX_TEXT)
  if ("location" in body) next.location = str(body.location, MAX_TEXT)
  if ("current_title" in body) next.current_title = str(body.current_title, MAX_TEXT)
  if ("current_company" in body) next.current_company = str(body.current_company, MAX_TEXT)
  if ("skills" in body) next.skills = list(body.skills)
  if ("qualities" in body) next.qualities = list(body.qualities, 20)
  if ("languages" in body) next.languages = list(body.languages, 20)
  if ("certifications" in body) next.certifications = list(body.certifications, 30)
  if ("experience" in body) next.experience = cleanExperiences(body.experience)
  if ("education" in body) next.education = cleanEducation(body.education)
  if ("other_sections" in body) next.other_sections = cleanSections(body.other_sections)
  return next
}

/** Champs du candidat miroirs du CV — la fiche les affiche depuis les colonnes,
 *  pas depuis le JSON. Sans ce report, corriger un nom dans le CV laisserait
 *  l'ancien en tête de fiche et dans le vivier. */
function mirroredColumns(cv: ParsedCv): Record<string, unknown> {
  return {
    full_name: cv.full_name ?? null,
    email: cv.email ?? null,
    phone: cv.phone ?? null,
    location: cv.location ?? null,
    current_title: cv.current_title ?? null,
    current_company: cv.current_company ?? null,
    skills: cv.skills ?? [],
    languages: cv.languages ?? [],
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })
  const gate = await requireActiveAccess()
  if (!gate.ok) return gate.response

  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  }

  // Lecture RLS : hors de l'organisation du caller, le candidat n'existe pas.
  const { data: candidate, error } = await sb
    .from("candidates")
    .select("id, parsed_cv, parsed_cv_original")
    .eq("id", id)
    .single()
  if (error || !candidate) return NextResponse.json({ error: "not_found" }, { status: 404 })

  const current = (candidate.parsed_cv ?? {}) as ParsedCv
  const next = applyEditableFields(current, body)

  const admin = getAdminSupabase()
  const { error: updateErr } = await admin
    .from("candidates")
    .update({
      parsed_cv: next,
      // Première retouche seulement : on fige ce que NORA avait produit.
      ...(candidate.parsed_cv_original ? {} : { parsed_cv_original: current }),
      parsed_cv_edited_at: new Date().toISOString(),
      parse_status: "manual",
      ...mirroredColumns(next),
    })
    .eq("id", id)

  if (updateErr) {
    console.error("[parsed-cv] update failed", updateErr)
    return NextResponse.json({ error: "update_failed", detail: "internal_error" }, { status: 500 })
  }
  return NextResponse.json({ ok: true, parsed_cv: next })
}

/** Retour à la version d'origine produite par Nora. */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })
  const gate = await requireActiveAccess()
  if (!gate.ok) return gate.response

  const { data: candidate, error } = await sb
    .from("candidates")
    .select("id, parsed_cv_original")
    .eq("id", id)
    .single()
  if (error || !candidate) return NextResponse.json({ error: "not_found" }, { status: 404 })
  if (!candidate.parsed_cv_original) {
    return NextResponse.json({ error: "no_original" }, { status: 400 })
  }

  const original = candidate.parsed_cv_original as ParsedCv
  const admin = getAdminSupabase()
  const { error: updateErr } = await admin
    .from("candidates")
    .update({
      parsed_cv: original,
      parsed_cv_original: null,
      parsed_cv_edited_at: null,
      parse_status: "parsed",
      ...mirroredColumns(original),
    })
    .eq("id", id)

  if (updateErr) {
    console.error("[parsed-cv] revert failed", updateErr)
    return NextResponse.json({ error: "revert_failed", detail: "internal_error" }, { status: 500 })
  }
  return NextResponse.json({ ok: true, parsed_cv: original })
}
