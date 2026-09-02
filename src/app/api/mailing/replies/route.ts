/**
 * GET  /api/mailing/replies      — ce que les candidats ont répondu au cabinet
 * POST /api/mailing/replies      — « je m'en occupe » (ou l'inverse)
 *
 * ── Le trou que ça bouche ─────────────────────────────────────────────────
 *
 * Les réponses arrivaient en base, Nora les analysait — et **rien ne le disait
 * au sourceur**. Il fallait rouvrir les fiches une par une pour les trouver.
 * Le commentaire en tête de `api/candidates/[id]/messages` raconte déjà la
 * conséquence : des sourceurs ont cru qu'un candidat ne répondait pas alors
 * que sa réponse était en base depuis des jours.
 *
 * ── Ce que cette route n'est PAS ──────────────────────────────────────────
 *
 * Une messagerie. Pas de dossiers, pas de recherche, pas de rédaction : une
 * liste de ce qui est revenu, et un moyen de dire qu'on s'en charge. Ce n'est
 * pas de la frugalité — le dossier de vérification Google décrit un produit où
 * « un sourceur écrit à un candidat un message choisi ». Une boîte de
 * réception complète contredirait ce qu'on a écrit pour l'obtenir.
 *
 * ── Pourquoi la prise en charge est au niveau du CABINET ──────────────────
 *
 * Le vivier est partagé. Le signal utile n'est pas « je l'ai lu » mais
 * « quelqu'un s'en occupe » — c'est ce qui empêche deux sourceurs de répondre
 * à la même personne. Cf. migration 099.
 */

import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { mailingVisible } from "@/lib/mailing/rollout"

export const runtime = "nodejs"

/** Assez pour une matinée de travail, pas assez pour ressembler à une boîte mail. */
const MAX_REPLIES = 30

async function viewer() {
  const sb = await createSupabaseServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { sb, user: null, profile: null, org: null }
  const { data: profile } = await sb
    .from("profiles").select("organization_id, is_admin").eq("user_id", user.id).maybeSingle()
  const { data: org } = await sb
    .from("organizations").select("mailing_early_access").eq("id", profile?.organization_id ?? "").maybeSingle()
  return { sb, user, profile, org }
}

export async function GET() {
  const { sb, user, profile, org } = await viewer()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })
  if (!mailingVisible(profile, org)) return NextResponse.json({ ok: true, enabled: false, replies: [], pending: 0 })

  /* Client RLS : le filtre d'organisation est celui de la base, pas une clause
   * que ce fichier pourrait oublier. Le tri décroissant est le bon sens de
   * lecture — la dernière réponse est celle qui compte. */
  const { data, error } = await sb
    .from("email_messages")
    .select("id, candidate_id, job_id, subject, body_text, ai_sentiment, ai_summary, handled_at, handled_by, created_at")
    .eq("direction", "inbound")
    .order("created_at", { ascending: false })
    .limit(MAX_REPLIES)

  if (error) {
    console.error("[mailing/replies] lecture impossible:", error.message)
    return NextResponse.json({ error: "read_failed", detail: "internal_error" }, { status: 500 })
  }

  const rows = data ?? []
  const candidateIds = [...new Set(rows.map((r) => r.candidate_id).filter(Boolean))] as string[]
  const jobIds = [...new Set(rows.map((r) => r.job_id).filter(Boolean))] as string[]

  /* Les noms sont lus en RLS, donc bornés à l'organisation. Deux requêtes
   * plutôt qu'une jointure : une FK vers `auth.users` fait planter
   * silencieusement l'auto-découverte de Supabase (règle établie du projet),
   * et les prénoms des collègues viennent d'ailleurs. */
  const [cands, jobs, people, matches] = await Promise.all([
    candidateIds.length
      ? sb.from("candidates").select("id, full_name").in("id", candidateIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
    jobIds.length
      ? sb.from("jobs").select("id, title").in("id", jobIds)
      : Promise.resolve({ data: [] as { id: string; title: string | null }[] }),
    sb.from("profiles").select("user_id, first_name"),
    /* Le match, pour ouvrir la CONVERSATION et non la fiche vivier. C'est sur
     * la fiche match que vivent le fil et la zone de réponse ; renvoyer
     * ailleurs obligerait le sourceur à un détour pour faire le seul geste
     * que cette liste doit déclencher. */
    candidateIds.length
      ? sb.from("match_assessments").select("id, candidate_id, job_id").in("candidate_id", candidateIds)
      : Promise.resolve({ data: [] as { id: string; candidate_id: string; job_id: string }[] }),
  ])

  const names = new Map((cands.data ?? []).map((c) => [c.id, c.full_name]))
  const titles = new Map((jobs.data ?? []).map((j) => [j.id, j.title]))
  const members = new Map((people.data ?? []).map((p) => [p.user_id, p.first_name]))
  const matchByPair = new Map((matches.data ?? []).map((m) => [`${m.candidate_id}:${m.job_id}`, m.id]))
  /* Repli quand la réponse n'a pas de mission (les tout premiers échanges, ou
   * ceux d'avant le rattachement par sous-adressage) : n'importe quel match du
   * candidat vaut mieux que pas de lien du tout — le fil s'y affiche aussi. */
  const anyMatch = new Map<string, string>()
  for (const m of matches.data ?? []) if (!anyMatch.has(m.candidate_id)) anyMatch.set(m.candidate_id, m.id)

  return NextResponse.json({
    ok: true,
    enabled: true,
    pending: rows.filter((r) => !r.handled_at).length,
    replies: rows.map((r) => ({
      id: r.id,
      candidateId: r.candidate_id,
      candidateName: r.candidate_id ? names.get(r.candidate_id) ?? null : null,
      jobId: r.job_id,
      jobTitle: r.job_id ? titles.get(r.job_id) ?? null : null,
      matchId: r.candidate_id
        ? (r.job_id ? matchByPair.get(`${r.candidate_id}:${r.job_id}`) : undefined)
          ?? anyMatch.get(r.candidate_id) ?? null
        : null,
      subject: r.subject,
      /* Un extrait, jamais le message entier : la liste sert à décider quoi
       * ouvrir. Et jamais `body_html` — le contenu d'un email entrant n'est
       * pas de confiance, le rendre serait offrir une injection à quiconque
       * connaît l'adresse de réception d'un sourceur. */
      excerpt: (r.body_text ?? "").replace(/\s+/g, " ").trim().slice(0, 180),
      sentiment: r.ai_sentiment,
      summary: r.ai_summary,
      handledAt: r.handled_at,
      handledBy: r.handled_by ? members.get(r.handled_by) ?? null : null,
      at: r.created_at,
    })),
  })
}

export async function POST(req: NextRequest) {
  const { sb, user, profile, org } = await viewer()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })
  if (!mailingVisible(profile, org)) return NextResponse.json({ error: "not_available" }, { status: 403 })

  const body = await req.json().catch(() => null)
  const id = typeof body?.id === "string" ? body.id : null
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 })
  const handled = body?.handled !== false

  /* Écrit via le client RLS, volontairement : une réponse d'une autre
   * organisation ne correspond à aucune ligne et l'écriture ne touche rien.
   * Le cloisonnement est celui de la base, pas une vérification qu'on
   * pourrait oublier de refaire à la prochaine retouche.
   *
   * `handled_by` garde le dernier à s'être manifesté — reprendre un dossier
   * est un geste normal, et écraser est ici le bon comportement. */
  const { data, error } = await sb
    .from("email_messages")
    .update(handled
      ? { handled_at: new Date().toISOString(), handled_by: user.id }
      : { handled_at: null, handled_by: null })
    .eq("id", id)
    .eq("direction", "inbound")
    .select("id, handled_at")
    .maybeSingle()

  if (error) {
    console.error("[mailing/replies] écriture impossible:", error.message)
    return NextResponse.json({ error: "write_failed", detail: "internal_error" }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 })

  return NextResponse.json({ ok: true, handledAt: data.handled_at })
}
