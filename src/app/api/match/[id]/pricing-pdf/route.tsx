/**
 * GET /api/match/:id/pricing-pdf?anonymize=1
 *
 * Returns a printable PDF of the current pricing scenario for a
 * candidate × mission. Two flavours:
 *   - default        : candidate full name + title (internal / shared
 *                      with a hiring manager)
 *   - anonymize=1    : candidate replaced by its short ref "C-XXXXXXXX"
 *                      (safe to share with the end client)
 *
 * The PDF carries the cabinet's brand identity (logo + name from the
 * caller's organization). Charts are omitted on purpose for V1 — the
 * value of the PDF is the audit-grade detail (margin, charges, syntec
 * params, avantages breakdown).
 */

import { NextResponse, type NextRequest } from "next/server"
import { renderToBuffer } from "@react-pdf/renderer"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getAdminSupabase } from "@/lib/admin-supabase"
import { computeMissionMargin, type Avantages, type Lieu } from "@/lib/pricing/syntec"
import { PRESETS, detectSeniority } from "@/lib/pricing/preset"
import { candidateRefLabel } from "@/lib/candidate-ref"
import { getCabinetBrand, getCabinetPricingConfig } from "@/lib/cabinet-config"
import { AVANTAGES_CONFIG, avantagesMonthlyTotal } from "@/lib/pricing/avantages-meta"
import { PricingScenarioPdf, type PricingPdfData } from "@/lib/pricing-pdf"
import type { Candidate, Job, PricingDefaultAvantages } from "@/lib/database.types"

export const runtime = "nodejs"
export const maxDuration = 30

const FALLBACK_AVANTAGES: Avantages = {
  ticketsResto: 6,
  mutuellePremium: 45,
  transport: 42,
  forfaitMobilite: 0,
  treiziemeMois: false,
  primeCooptationAnnuelle: 0,
  autresMensuels: 0,
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  const anonymize = req.nextUrl.searchParams.get("anonymize") === "1"

  // 1. Match + candidate + job — RLS already restricts to the org.
  const { data: row, error: matchErr } = await sb
    .from("match_assessments")
    .select("id, candidate_id, job_id, pricing_tjm, pricing_brut, pricing_avantages_override")
    .eq("id", id)
    .single()
  if (matchErr || !row) return NextResponse.json({ error: "not_found" }, { status: 404 })

  const [{ data: candidate }, { data: job }] = await Promise.all([
    sb.from("candidates").select("*").eq("id", row.candidate_id).single(),
    sb.from("jobs").select("*").eq("id", row.job_id).single(),
  ])
  if (!candidate || !job) return NextResponse.json({ error: "not_found" }, { status: 404 })

  // 2. Cabinet brand + pricing config.
  const brand = await getCabinetBrand(sb, user.id)
  const cfg = await getCabinetPricingConfig(sb, user.id)

  // 3. Inline the logo as base64 — @react-pdf/renderer can't fetch from
  //    storage URLs server-side reliably; reading the file bytes and
  //    handing them as a data: URL works on every runtime.
  let logoBase64: string | null = null
  if (brand?.brand_logo_path) {
    try {
      const admin = getAdminSupabase()
      const { data: file } = await admin.storage.from("brand-logos").download(brand.brand_logo_path)
      if (file) {
        const buf = Buffer.from(await file.arrayBuffer())
        const mime = file.type || "image/png"
        logoBase64 = `data:${mime};base64,${buf.toString("base64")}`
      }
    } catch (err) {
      console.error("[pricing-pdf] logo download failed:", (err as Error).message)
    }
  }

  // 4. Recompute the margin server-side so the PDF reflects EXACTLY
  //    what's in the DB at this moment (no trust in client input).
  const pricing = computePricingSnapshot({
    candidate: candidate as Candidate,
    job: job as Job,
    persistedTjm: row.pricing_tjm,
    persistedBrut: row.pricing_brut,
    avantagesOverride: row.pricing_avantages_override as PricingDefaultAvantages | null,
    cabinetAvantages: cfg?.pricing_default_avantages ?? null,
    joursParMois: cfg?.pricing_billable_days_per_month ?? 21,
    rttJoursAn: cfg?.pricing_rtt_days_per_year ?? 0,
    defaultLieu: cfg?.pricing_default_lieu ?? "paris_petite_couronne",
  })

  // 5. Build the PDF payload.
  const candidateLabel = anonymize
    ? `Réf ${candidateRefLabel(candidate.id)}`
    : (candidate.full_name?.trim() || `Réf ${candidateRefLabel(candidate.id)}`)

  const data: PricingPdfData = {
    cabinet: {
      name: brand?.brand_name?.trim() || brand?.organization_name || "Organisation",
      logoBase64,
    },
    candidate: {
      label: candidateLabel,
      title: anonymize ? null : (candidate.current_title ?? null),
    },
    mission: {
      title: job.title,
      location: job.location ?? null,
      startDate: job.start_date ?? null,
      durationMonths: job.duration_months ?? null,
      contractType: job.contract_type ?? null,
    },
    pricing,
    avantages: formatAvantages(pricing.avantagesUsed),
    generatedAt: new Date().toISOString(),
    generatedBy: anonymize ? "Naywa Studio" : (user.email ?? "Naywa Studio"),
  }

  // 6. Render.
  const stream = await renderToBuffer(<PricingScenarioPdf data={data} />)
  const filename = anonymize
    ? `pricing-anonymise-${candidateRefLabel(candidate.id)}.pdf`
    : `pricing-${slugifyForFile(candidate.full_name ?? "candidat")}-${slugifyForFile(job.title)}.pdf`

  return new NextResponse(new Uint8Array(stream), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  })
}

/* ─────────────── helpers ─────────────── */

interface PricingComputed {
  tjm: number
  brutAnnuel: number
  margeAvgPct: number
  margeMensuelleEur: number
  margeTotaleEur: number
  margeMinPct: number | null
  margeTargetPct: number | null
  statut: string
  position: string
  coefficient: number
  joursParMois: number
  rttJoursAn: number
  avantagesUsed: Avantages
}

function computePricingSnapshot(args: {
  candidate: Candidate
  job: Job
  persistedTjm: number | null
  persistedBrut: number | null
  avantagesOverride: PricingDefaultAvantages | null
  cabinetAvantages: PricingDefaultAvantages | null
  joursParMois: number
  rttJoursAn: number
  defaultLieu: Lieu
}): PricingComputed {
  const { candidate, job } = args
  const seniorityKey = detectSeniority(candidate.parsed_cv, candidate.current_title)
  const preset = PRESETS[seniorityKey]

  const lieu: Lieu = (job.pricing_lieu as Lieu | null) ?? args.defaultLieu

  const tjm = args.persistedTjm
    ?? (job.client_tjm_min != null && job.client_tjm_max != null
      ? Math.round((job.client_tjm_min + job.client_tjm_max) / 2)
      : (job.client_tjm_min ?? job.client_tjm_max ?? 550))
  const brutAnnuel = args.persistedBrut ?? job.target_gross_salary ?? 45000

  const avantagesUsed: Avantages = {
    ...FALLBACK_AVANTAGES,
    ...(args.cabinetAvantages ?? {}),
    ...(args.avantagesOverride ?? {}),
  }
  if (!job.has_grand_deplacement) avantagesUsed.urssafIndemniteJour = 0
  if (!job.is_expatriated)        avantagesUsed.expatriationMensuelle = 0

  const inputs = {
    brutAnnuel,
    statut: preset.statut,
    position: preset.position,
    coefficient: preset.coefficient,
    modalite: preset.modalite,
    lieu,
    avantages: avantagesUsed,
    joursFacturablesParMois: args.joursParMois,
    rttDaysPerYear: args.rttJoursAn,
  }
  const startDate = job.start_date ? new Date(job.start_date) : new Date()
  const margin = computeMissionMargin(inputs, tjm, startDate, job.duration_months ?? 12)

  return {
    tjm,
    brutAnnuel,
    margeAvgPct: margin.margePct,
    margeMensuelleEur: margin.margeMoyenneEur,
    margeTotaleEur: margin.margeTotaleEur,
    margeMinPct: job.margin_min_pct ?? null,
    margeTargetPct: job.margin_target_pct ?? null,
    statut: preset.statut,
    position: preset.position,
    coefficient: preset.coefficient,
    joursParMois: args.joursParMois,
    rttJoursAn: args.rttJoursAn,
    avantagesUsed,
  }
}

function formatAvantages(a: Avantages): Array<{ label: string; valueLabel: string }> {
  void avantagesMonthlyTotal
  const out: Array<{ label: string; valueLabel: string }> = []
  for (const cfg of AVANTAGES_CONFIG) {
    const raw = (a as Record<string, unknown>)[cfg.key]
    const n = Number(raw)
    if (Number.isFinite(n) && n > 0) {
      out.push({ label: cfg.label, valueLabel: `${Math.round(n)} ${cfg.suffix}` })
    }
  }
  if (a.treiziemeMois) out.push({ label: "13ᵉ mois", valueLabel: "oui" })
  return out
}

function slugifyForFile(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "doc"
}
