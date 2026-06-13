/**
 * GET /api/export/me
 *
 * Owner-only. Retourne un JSON unique contenant toutes les données
 * de l'organisation pour exercice du droit à la portabilité (RGPD)
 * et pour permettre un export-before-lockdown.
 *
 * Pas de restore : on n'autorise pas le réimport (RGPD reconsent des
 * candidats, complexité de schema migration). L'export est un snapshot
 * statique, à conserver par l'user.
 *
 * Le fichier est servi comme `application/json` avec un Content-
 * Disposition attachment pour déclencher le download navigateur direct.
 *
 * Avertissement métier : "Nous ne garantissons pas la restauration des
 * données. Cet export sert d'archive, pas de mécanisme de recovery."
 * (cf le bouton UI qui affiche ce disclaimer côté `/organisation`)
 */

import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getAdminSupabase } from "@/lib/admin-supabase"

export const runtime = "nodejs"

export async function GET() {
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 })
  }

  const { data: profile, error: profileErr } = await sb
    .from("profiles")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .single()
  if (profileErr || !profile?.organization_id) {
    return NextResponse.json({ error: "Profil introuvable" }, { status: 404 })
  }
  if (profile.role !== "owner") {
    return NextResponse.json(
      { error: "Seul l'owner peut exporter les données du cabinet" },
      { status: 403 },
    )
  }

  const admin = getAdminSupabase()
  const orgId = profile.organization_id

  const [org, members, candidates, jobs, matches, emails, clusters] = await Promise.all([
    admin.from("organizations").select("*").eq("id", orgId).single(),
    admin.from("profiles").select("user_id, first_name, role, has_sourcing_seat").eq("organization_id", orgId),
    admin.from("candidates").select("*").eq("organization_id", orgId),
    admin.from("jobs").select("*").eq("organization_id", orgId),
    admin.from("match_assessments").select("*").eq("organization_id", orgId),
    admin.from("email_messages").select("*").eq("organization_id", orgId),
    admin.from("cluster_manifests").select("*").eq("organization_id", orgId),
  ])

  const exportPayload = {
    meta: {
      generated_at: new Date().toISOString(),
      generator: "naywa-studio export v1",
      organization_id: orgId,
      disclaimer:
        "Cet export est un snapshot des données du cabinet à la date de génération. " +
        "En raison des mises à jour produit et de l'évolution du schéma, nous ne pouvons " +
        "pas garantir la restauration complète de ces données dans une future version du " +
        "service. Conservez ce fichier comme archive.",
    },
    organization: org.data ?? null,
    members: members.data ?? [],
    candidates: candidates.data ?? [],
    jobs: jobs.data ?? [],
    match_assessments: matches.data ?? [],
    email_messages: emails.data ?? [],
    cluster_manifests: clusters.data ?? [],
  }

  const json = JSON.stringify(exportPayload, null, 2)
  const safeName = (org.data?.name ?? "cabinet")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "cabinet"
  const stamp = new Date().toISOString().slice(0, 10)

  return new NextResponse(json, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="naywa-export-${safeName}-${stamp}.json"`,
    },
  })
}
