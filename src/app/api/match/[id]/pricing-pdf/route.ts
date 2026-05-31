/**
 * POST /api/match/:id/pricing-pdf
 *
 * Body :
 *   {
 *     tjm: number, brutAnnuel: number,
 *     position: string, coefficient: number,
 *     seniorityLabel: string,
 *     lieu: Lieu, modalite: Modalite, statut: Statut,
 *     joursFacturablesParMois: number,
 *   }
 *
 * Génère une synthèse pricing PDF d'une page à partir des derniers réglages
 * vus dans le widget. La logique métier (charges, calendrier, marge) reste
 * 100 % côté syntec.ts — l'API ne fait que router le rendu.
 *
 * Le PDF embarque le logo cabinet (brand_logo_path du profil) si dispo.
 */

import { NextRequest, NextResponse } from "next/server"
import { renderToBuffer } from "@react-pdf/renderer"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getAdminSupabase } from "@/lib/admin-supabase"
import {
  computeEmployerCost,
  computeMissionMargin,
  type Avantages,
  type Lieu,
  type Modalite,
  type PricingInputs,
  type Statut,
} from "@/lib/pricing/syntec"
import { missionMonthProfile } from "@/lib/pricing/calendar"
import PricingPdf from "@/lib/pricing/pricing-pdf"

export const runtime = "nodejs"

const FALLBACK_AVANTAGES: Avantages = {
  ticketsResto: 6,
  mutuellePremium: 45,
  transport: 42,
  forfaitMobilite: 0,
  treiziemeMois: false,
  primeCooptationAnnuelle: 0,
  autresMensuels: 0,
}

interface Body {
  tjm: number
  brutAnnuel: number
  position: string
  coefficient: number
  seniorityLabel: string
  lieu: Lieu
  modalite: Modalite
  statut: Statut
  joursFacturablesParMois: number
  margeMinPct: number
  margeTargetPct: number
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  const body = (await req.json().catch(() => null)) as Body | null
  if (!body) return NextResponse.json({ error: "bad_body" }, { status: 400 })

  // Load match + candidate + job (RLS-scoped → 404 if not owner).
  const { data: match, error: matchErr } = await sb
    .from("match_assessments")
    .select(`
      id, candidate:candidates(id, full_name, current_title, years_experience),
      job:jobs(
        id, title, location, contract_type, duration_months, start_date,
        has_grand_deplacement, is_expatriated
      )
    `)
    .eq("id", id)
    .single()
  if (matchErr || !match) return NextResponse.json({ error: "not_found" }, { status: 404 })
  // Supabase types the joined relations as arrays in the query result even
  // when the FK is 1-to-1; normalise here so downstream code can stay flat.
  const candidate = Array.isArray(match.candidate) ? match.candidate[0] : match.candidate
  const job       = Array.isArray(match.job)       ? match.job[0]       : match.job
  if (!candidate || !job) return NextResponse.json({ error: "not_found" }, { status: 404 })
  if (!job.start_date || !job.duration_months) {
    return NextResponse.json({ error: "mission_not_parametered" }, { status: 400 })
  }

  // Profile : cabinet defaults + brand
  const { data: profile } = await sb
    .from("profiles")
    .select("brand_name, brand_logo_path, pricing_default_avantages, pricing_billable_days_per_month")
    .eq("user_id", user.id)
    .maybeSingle()

  // Signed brand logo URL (1h) for the PDF — same pattern as anonymize.
  let brandLogoUrl: string | null = null
  if (profile?.brand_logo_path) {
    const admin = getAdminSupabase()
    const { data: signed } = await admin.storage
      .from("brand-logos")
      .createSignedUrl(profile.brand_logo_path, 60 * 60)
    brandLogoUrl = signed?.signedUrl ?? null
  }

  // Build effective avantages from cabinet defaults, neutralising the
  // conditional ones the mission doesn't activate.
  const avantages: Avantages = {
    ...FALLBACK_AVANTAGES,
    ...(profile?.pricing_default_avantages ?? {}),
  }
  if (!job.has_grand_deplacement) avantages.urssafIndemniteJour = 0
  if (!job.is_expatriated)        avantages.expatriationMensuelle = 0

  const inputs: PricingInputs = {
    brutAnnuel: body.brutAnnuel,
    statut: body.statut,
    position: body.position,
    coefficient: body.coefficient,
    modalite: body.modalite,
    lieu: body.lieu,
    avantages,
    joursFacturablesParMois: body.joursFacturablesParMois ?? profile?.pricing_billable_days_per_month ?? 21,
  }

  let buffer: Buffer
  try {
    const startDate = new Date(job.start_date)
    const cost = computeEmployerCost(inputs)
    const summary = computeMissionMargin(inputs, body.tjm, startDate, job.duration_months)
    const months = missionMonthProfile(startDate, Math.max(1, job.duration_months))
    const monthly = months.map((m) => {
      const revenu = body.tjm * m.workingDays
      const coutTotal = cost.coutFixeMensuel + cost.coutVariableJournalier * m.workingDays
      const marge = revenu - coutTotal
      const margePct = revenu > 0 ? (marge / revenu) * 100 : 0
      return { ...m, revenu, coutTotal, marge, margePct }
    })

    buffer = Buffer.from(
      await renderToBuffer(
        PricingPdf({
          brand: { name: profile?.brand_name ?? null, logoUrl: brandLogoUrl },
          mission: {
            title: job.title,
            location: job.location,
            contract: job.contract_type,
            durationMonths: job.duration_months,
            startDate: job.start_date,
          },
          candidate: {
            fullName: candidate.full_name ?? "Candidat",
            currentTitle: candidate.current_title,
            yearsExperience: candidate.years_experience,
          },
          pricing: {
            tjm: body.tjm,
            brutAnnuel: body.brutAnnuel,
            inputs,
            seniorityLabel: body.seniorityLabel,
            lieu: body.lieu,
          },
          margins: {
            margeMinPct: body.margeMinPct,
            margeTargetPct: body.margeTargetPct,
          },
          monthly,
          summary,
          cost,
          avantages,
        }),
      ),
    )
  } catch (err) {
    return NextResponse.json(
      { error: "render_failed", detail: (err as Error).message },
      { status: 500 },
    )
  }

  // Slugify candidate name for the filename — accents stripped to keep
  // Content-Disposition safe across browsers.
  const safeName = (candidate.full_name ?? "candidat")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .toLowerCase()
    .replace(/^-+|-+$/g, "")
  const date = new Date().toISOString().slice(0, 10)
  const filename = `pricing-${safeName}-${date}.pdf`

  // Use a Uint8Array body to keep TS happy on Edge-style Response types.
  const bytes = new Uint8Array(buffer.byteLength)
  bytes.set(buffer)
  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  })
}
