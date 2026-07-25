/**
 * POST /api/cabinet/anonymize-sample
 *
 * Rend un CV anonymisé d'EXEMPLE (candidat générique) avec le branding réel du
 * cabinet + le gabarit fourni dans le body (défauts d'anonymisation en cours
 * d'édition, éventuellement non sauvegardés). Sert l'aperçu « Télécharger un
 * exemple » de la carte Branding.
 *
 * Aucun stockage R2, aucun appel LLM (résumé d'exemple figé) : c'est un
 * throwaway → zéro quota consommé. Le PDF est renvoyé directement en flux.
 *
 * Accès : owner OU délégué branding, et abonnement/essai actif (comme
 * l'anonymisation réelle — la fonctionnalité est gatée package payant/essai).
 */

import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getAdminSupabase } from "@/lib/admin-supabase"
import { requireActiveAccess } from "@/lib/access-guard"
import { getCapabilities } from "@/lib/capabilities"
import { renderToBuffer } from "@react-pdf/renderer"
import { AnonymizedCv } from "@/lib/anonymized-cv"
import { readOrgDefaults } from "@/components/workspace/anonymize/types"
import type { Candidate } from "@/lib/database.types"

export const runtime = "nodejs"
export const maxDuration = 30

// Candidat générique — profil crédible, entièrement fictif. Le CV anonymisé
// masque de toute façon nom/école/coordonnées ; l'exemple sert à juger le
// GABARIT (mise en page + couleurs + logo + filigrane + email de contact).
const SAMPLE_CANDIDATE = {
  id: "00000000-0000-0000-0000-0000000005a3", // → réf C-00000000
  current_title: "Chef de projet digital",
  current_company: null,
  years_experience: 6,
  seniority_level: "senior",
  skills: ["Gestion de projet", "Agile / Scrum", "Analyse de données", "Cadrage produit", "Conduite du changement"],
  languages: ["Français (natif)", "Anglais (courant)", "Espagnol (notions)"],
  taxonomy: {
    role_family: ["Chef de projet"],
    core_skills: ["Gestion de projet", "Agile / Scrum", "Analyse de données", "Cadrage produit", "Conduite du changement", "Reporting"],
  },
  parsed_cv: {
    summary: "Profil orienté pilotage de projets digitaux, à l'aise sur le cadrage, la coordination d'équipes pluridisciplinaires et le suivi d'indicateurs.",
    seniority_level: "senior",
    years_experience: 6,
    experience: [
      {
        title: "Chef de projet digital",
        company: "Groupe agroalimentaire",
        start: "2021", end: "présent", location: "Paris",
      },
      {
        title: "Consultant junior",
        company: "Cabinet de conseil",
        start: "2019", end: "2021", location: "Lyon",
      },
    ],
    education: [
      { degree: "Master Management", school: "École de commerce", field: "Stratégie & digital", start: "2017", end: "2019" },
    ],
    languages: ["Français (natif)", "Anglais (courant)", "Espagnol (notions)"],
  },
} as unknown as Candidate

// Résumé d'exemple figé (pas d'appel LLM) — montre à quoi ressemble le bloc
// résumé quand il est activé dans une mission.
const SAMPLE_SUMMARY =
  "6 ans d'expérience en pilotage de projets digitaux, avec une maîtrise des méthodes agiles et de l'analyse d'indicateurs. A conduit des projets de cadrage produit et de conduite du changement dans des contextes multi-équipes."

export async function POST(req: NextRequest) {
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })
  const gate = await requireActiveAccess()
  if (!gate.ok) return gate.response

  const { data: profile } = await sb
    .from("profiles").select("*").eq("user_id", user.id).maybeSingle()
  if (!profile?.organization_id) {
    return NextResponse.json({ error: "no_organization" }, { status: 400 })
  }
  // Gabarit d'anonymisation = domaine branding : owner ou délégué habilité.
  const caps = getCapabilities(profile)
  if (!caps.canBranding) {
    return NextResponse.json({ error: "branding_forbidden" }, { status: 403 })
  }

  const body = await req.json().catch(() => null) as { anonymize_defaults?: unknown } | null

  const { data: org } = await sb
    .from("organizations")
    .select("brand_name, brand_logo_path, brand_color, brand_color_secondary, brand_slogan, contact_email, name, anonymize_defaults")
    .eq("id", profile.organization_id)
    .maybeSingle()

  // Priorité aux défauts fournis (édition en cours, non sauvegardés) ; sinon
  // ceux persistés en base.
  const defaults = readOrgDefaults(
    body && "anonymize_defaults" in body ? body.anonymize_defaults : org?.anonymize_defaults,
  )

  let brandLogoUrl: string | null = null
  if (org?.brand_logo_path) {
    const { data: signed } = await getAdminSupabase().storage
      .from("brand-logos")
      .createSignedUrl(org.brand_logo_path, 60 * 60)
    brandLogoUrl = signed?.signedUrl ?? null
  }

  const brand = {
    name: (org?.brand_name?.trim() || org?.name?.trim()) || null,
    logoUrl: brandLogoUrl,
    color: org?.brand_color ?? null,
    colorSecondary: org?.brand_color_secondary ?? null,
    slogan: org?.brand_slogan ?? null,
    contactEmail: org?.contact_email ?? null,
  }

  let buffer: Buffer
  try {
    buffer = Buffer.from(
      await renderToBuffer(
        AnonymizedCv({
          candidate: SAMPLE_CANDIDATE,
          reference: "EXEMPLE",
          job: null,
          brand,
          // On force l'affichage du résumé pour montrer le gabarit complet,
          // avec un texte figé (pas d'appel LLM).
          executiveSummary: SAMPLE_SUMMARY,
          options: {
            template: defaults.template,
            keepNoraSummary: true,
            customText: "",
            watermark: defaults.watermark,
            watermarkText: defaults.watermarkText,
            language: "fr",
          },
        }),
      ),
    )
  } catch (err) {
    return NextResponse.json({ error: "render_failed", detail: (err as Error).message }, { status: 500 })
  }

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="exemple-cv-anonymise.pdf"',
      "Cache-Control": "no-store",
    },
  })
}
