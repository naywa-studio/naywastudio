/**
 * POST /api/workspace/chat
 * Central workspace AI — manages missions, briefs, searches.
 * Injects workspace_memory + optional mission brief_memory into system prompt.
 * Triggers compaction when conversation exceeds token threshold.
 */

import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { createClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"
import type { Database, WorkspaceMsg } from "@/lib/database.types"

const COMPACTION_TOKEN_THRESHOLD = 16_000 // ~64k chars ≈ 16k tokens

function supabaseAdmin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function countApproxTokens(msgs: WorkspaceMsg[]): number {
  const total = msgs.reduce((acc, m) => acc + m.content.length, 0)
  return Math.round(total / 4)
}

const WORKSPACE_SYSTEM_PROMPT = `Tu es l'assistant IA central de Naywa Studio, une plateforme de sourcing LinkedIn.
Tu aides le recruteur a creer des missions et lancer des recherches depuis le chat.

=== SYSTEME DE COMMANDES ===
Tu DOIS ecrire une balise <action> dans ton message chaque fois qu'une action est requise.
Le systeme extrait et execute la balise cote serveur — l'utilisateur ne la voit pas dans l'interface.
Ne mentionne jamais les mots "action", "balise", "JSON", "systeme" dans ton texte visible.

FORMAT OBLIGATOIRE : une seule balise par reponse, JSON compact sur UNE SEULE LIGNE, sans retour a la ligne dans le JSON :
<action>{"type":"TYPE","cle":"valeur"}</action>

Types disponibles :
- create_mission : cree le dossier + brief en une fois
- run_mission    : lance la recherche
- update_brief   : modifie le brief existant

=== QUAND ECRIRE UNE BALISE <action> ===

Pour creer une mission de qualite, tu cherches a obtenir 4 infos. Verifie-les dans l'ordre :
  1. Poste (titre)               — OBLIGATOIRE
  2. Localisation (ville/region) — OBLIGATOIRE
  3. Seniorite ou experience     — fortement souhaitee (ex: "5 ans d'experience", "junior", "senior", "lead")
  4. Au moins une specialisation, secteur ou competence-cle — fortement souhaitee

Le poste seul (ex: "Business Analyst") sans contexte est trop vague — demande la specialisation ou le secteur.
Mais une specialisation/secteur/outil mentionne SUFFIT : "Business Analyst monetique" → monetique compte. "Ingenieur fiabilite" → fiabilite compte. Ne redemande pas plus.

[BRIEF QUASI-COMPLET — poste + lieu + (seniorite OU specialisation/secteur)]
Cree la mission immediatement. Si l'une des deux dernieres infos manque (seniorite / specialisation), va quand meme creer la mission MAIS mentionne dans le texte qu'elle peut etre encore precisee.

Ecris OBLIGATOIREMENT cette balise dans ton message (JSON sur UNE SEULE LIGNE) :
<action>{"type":"create_mission","title":"Titre Court","brief":{"titre_poste":"Poste","localisation":"Ville","mots_cles":["comp1","comp2","comp3"],"criteres":"seniorite et autres criteres mentionnes","ton":"Direct et humain"}}</action>
Puis en texte (2-3 phrases max) : confirme le poste/lieu/competences retenus, termine par "Je peux lancer la recherche ?"

[INFOS INSUFFISANTES — poste flou OU pas de lieu OU brief tres pauvre]
Pas de balise. Pose UNE seule question precise (la plus importante). Priorite :
  - Pas de poste clair → demande le poste exact
  - Pas de lieu → demande la ville
  - Pas de specialisation/seniorite ET poste large (ex: "developpeur") → demande "Vous cherchez plutot un junior, confirme ou senior ? Et y a-t-il un domaine particulier (back-end, mobile, data...) ?"

Ne saoule jamais l'utilisateur : maximum 2 questions de clarification avant de creer la mission.

[CONFIRMATION — utilisateur dit oui/lancez/c'est bon/parfait/top/go/ok]
L'ID exact de la mission t'est donne plus bas dans le contexte sous "ID mission : <id>".
Recopie cet UUID complet entre les guillemets de missionId (PAS le mot "id", PAS le placeholder).
Si le contexte ne donne pas d'ID, ecris missionId:"" (chaine vide) — le serveur resoudra.
Format : <action>{"type":"run_mission","missionId":"<uuid-du-contexte>"}</action>
Texte : "Recherche lancee ! Redirection vers le dossier en cours..."

[MISSION EXISTANTE ATTACHEE]
Brief disponible en contexte. Quand l'utilisateur demande de "chercher encore", "relancer", "trouver plus de candidats", "refaire la recherche" ou similaire :
- Si la mission attachée est OK telle quelle, emets DIRECTEMENT run_mission avec son ID (le serveur sait re-lancer une mission completed/error).
- Si l'utilisateur veut affiner avant, emets update_brief puis suggere de relancer.
Format strict : <action>{"type":"run_mission","missionId":"<uuid-attache>"}</action>
Texte : "Je relance la recherche sur cette mission..."

=== REGLES BRIEF ===
- titre_poste  : 1-4 mots (ex: "Business Analyst Monetique", "Developpeur Full Stack", "DRH")
- mots_cles    : 4-8 mots-cles pertinents. REGLES :
    * Inclure les termes metier mentionnes par le client (secteur, specialisation, outils)
    * Jamais de soft skills (communication, leadership…)
    * Pour les metiers techniques : ajouter les equivalents ANGLAIS (ex: "monetique" → "payment", "fiabilite" → "reliability")
    * Inclure le SECTEUR si mentionne (ex: "banque", "fintech", "oil & gas", "pharma")
- localisation : TOUJOURS la ville principale
    * "Ile-de-France", "Paris region", "Courbevoie", "Neuilly" → ecrire "Paris"
    * "Villeurbanne", "Bron" → ecrire "Lyon"
    * "Merignac", "Pessac" → ecrire "Bordeaux"
    * Si "national" ou "multi-sites" → ecrire "France"
- criteres     : seniorite, contrat, secteur cible, urgence, salaire si mentionnes
- ton          : style de contact (ex: "Direct et humain", "Professionnel")

=== STYLE ===
- Collegue senior, chaleureux et efficace
- 2-3 phrases max par reponse
- **Gras** sur les elements cles (poste, lieu, competences)
- Toujours en francais
- Recrutement et sourcing uniquement`

const COMPACTION_PROMPT = `Résume la conversation ci-dessous en un fichier mémoire Markdown structuré.
Ce fichier sera injecté dans les futures conversations pour donner le contexte au début.
Sois concis mais complet. Capture : le profil du client, ses préférences, les missions en cours et leur état, les décisions importantes prises.
Format :
# Mémoire Workspace
## Profil client
...
## Missions en cours
...
## Contexte et préférences
...`

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const sb = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try { toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {}
        },
      },
    }
  )

  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json() as {
    message: string
    attachedMissionId?: string
    attachedMissionTitle?: string
  }

  const { message, attachedMissionId, attachedMissionTitle } = body
  if (!message?.trim()) return NextResponse.json({ error: "Empty message" }, { status: 400 })

  const sbAdmin = supabaseAdmin()

  // Load profile (workspace memory + message history)
  const { data: profile } = await sbAdmin
    .from("profiles")
    .select("workspace_memory, workspace_messages, subscription_level, first_name, booking_url")
    .eq("user_id", user.id)
    .single()

  const workspaceMemory = profile?.workspace_memory ?? null
  const existingMessages: WorkspaceMsg[] = (profile?.workspace_messages as WorkspaceMsg[] | null) ?? []

  // Load mission memory if attached
  let missionMemory: string | null = null
  let missionTitle = attachedMissionTitle ?? null
  if (attachedMissionId) {
    const { data: mission } = await sbAdmin
      .from("missions")
      .select("brief_memory, title, brief, status, profiles_count")
      .eq("id", attachedMissionId)
      .eq("user_id", user.id)
      .single()

    if (mission) {
      missionTitle = mission.title
      if (mission.brief_memory) {
        missionMemory = mission.brief_memory
      } else if (mission.brief) {
        const b = mission.brief
        missionMemory = `# Mission : ${mission.title}
Statut : ${mission.status}
Poste : ${b.titre_poste}
Localisation : ${b.localisation}
Mots-clés : ${b.mots_cles?.join(", ")}
${b.criteres ? `Critères : ${b.criteres}` : ""}
${b.ton ? `Ton : ${b.ton}` : ""}
Profils trouvés : ${mission.profiles_count}`
      }
    }
  }

  // Build system prompt
  let systemPrompt = WORKSPACE_SYSTEM_PROMPT

  if (workspaceMemory) {
    systemPrompt += `\n\n---\n${workspaceMemory}`
  }

  if (missionMemory) {
    systemPrompt += `\n\n---\n## Dossier-mission attaché : "${missionTitle}"\nID mission : ${attachedMissionId}\n${missionMemory}`
  } else if (attachedMissionId) {
    // Mission attached but no brief yet — still inject the ID
    systemPrompt += `\n\n---\n## Dossier-mission attaché : "${missionTitle ?? "Sans titre"}"\nID mission : ${attachedMissionId}\nAucun brief défini pour l'instant.`
  }

  // Client context
  systemPrompt += `\n\n---\nClient : ${profile?.first_name ?? user.email}
Niveau agent : ${profile?.subscription_level ?? "inconnu"}
${profile?.booking_url ? `Lien booking : ${profile.booking_url}` : ""}`

  // Add new user message
  const newUserMsg: WorkspaceMsg = {
    id: crypto.randomUUID(),
    role: "user",
    content: message,
    ...(attachedMissionId ? { attachedMissionId, attachedMissionTitle: missionTitle ?? undefined } : {}),
  }

  const updatedMessages = [...existingMessages, newUserMsg]

  // Build OpenRouter messages
  const openrouterMessages = updatedMessages.map((m) => ({
    role: m.role,
    content: m.attachedMissionTitle
      ? `[Mission attachée : "${m.attachedMissionTitle}"]\n${m.content}`
      : m.content,
  }))

  const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY
  if (!OPENROUTER_KEY) return NextResponse.json({ error: "OpenRouter not configured" }, { status: 500 })

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL ?? "https://nawastudio.com",
      "X-Title": "Naywa Studio",
    },
    body: JSON.stringify({
      // gpt-4o-mini was unreliable at emitting <action> tags consistently;
      // gpt-4o follows the structured output rule far more reliably.
      model: "openai/gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        ...openrouterMessages,
      ],
      temperature: 0.3,
      max_tokens: 800,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    return NextResponse.json({ error: `OpenRouter error: ${err}` }, { status: 502 })
  }

  const data = await res.json() as { choices: Array<{ message: { content: string } }> }
  const assistantContent = data.choices[0]?.message?.content ?? ""

  // Parse action tags from response
  const actionMatch = assistantContent.match(/<action>([\s\S]*?)<\/action>/)
  let action: Record<string, unknown> | null = null
  let cleanContent = assistantContent
  if (actionMatch) {
    try {
      action = JSON.parse(actionMatch[1].trim())
      cleanContent = assistantContent.replace(/<action>[\s\S]*?<\/action>/g, "").trim()
    } catch { /* ignore parse error */ }
  }

  const newAssistantMsg: WorkspaceMsg = {
    id: crypto.randomUUID(),
    role: "assistant",
    content: cleanContent,
  }

  const finalMessages = [...updatedMessages, newAssistantMsg]

  // Check if compaction needed
  const approxTokens = countApproxTokens(finalMessages)
  let savedMessages = finalMessages
  let newWorkspaceMemory = workspaceMemory

  if (approxTokens > COMPACTION_TOKEN_THRESHOLD) {
    try {
      const compactRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENROUTER_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "openai/gpt-4o-mini",
          messages: [
            { role: "system", content: COMPACTION_PROMPT },
            { role: "user", content: finalMessages.map((m) => `${m.role}: ${m.content}`).join("\n\n") },
          ],
          temperature: 0.3,
          max_tokens: 1200,
        }),
      })
      if (compactRes.ok) {
        const compactData = await compactRes.json() as { choices: Array<{ message: { content: string } }> }
        newWorkspaceMemory = compactData.choices[0]?.message?.content ?? workspaceMemory
        savedMessages = []
      }
    } catch { /* keep existing if compaction fails */ }
  }

  // ── Handle create_mission (with optional embedded brief) ────────────────────
  if (action?.type === "create_mission" && action.title) {
    const { data: newMission } = await sbAdmin
      .from("missions")
      .insert({
        title: action.title as string,
        user_id: user.id,
        agent_level: profile?.subscription_level === "leo" ? "leo" : "nora",
      })
      .select()
      .single()

    if (newMission) {
      action = { ...action, missionId: newMission.id }

      // If brief is embedded in create_mission, save it immediately
      let brief = action.brief
      if (brief) {
        try {
          if (typeof brief === "string") brief = JSON.parse(brief)
          const b = brief as import("@/lib/database.types").MissionBrief
          await sbAdmin
            .from("missions")
            .update({ brief: b, status: "preparation" })
            .eq("id", newMission.id)

          const mem = `# Mission brief\nPoste : ${b.titre_poste}\nLocalisation : ${b.localisation}\nMots-clés : ${Array.isArray(b.mots_cles) ? b.mots_cles.join(", ") : ""}\nCritères : ${b.criteres ?? ""}\nTon : ${b.ton ?? ""}`
          await sbAdmin.from("missions").update({ brief_memory: mem }).eq("id", newMission.id)
        } catch { /* ignore malformed brief */ }
      } else {
        // Fallback: build a minimal brief from the title so brief is never null
        const titleWords = (action.title as string).split(/\s+/)
        const fallbackBrief: import("@/lib/database.types").MissionBrief = {
          titre_poste: action.title as string,
          localisation: "France",
          mots_cles: titleWords.filter((w: string) => w.length > 3),
          criteres: "",
          ton: "Direct et humain",
        }
        await sbAdmin
          .from("missions")
          .update({ brief: fallbackBrief, status: "preparation" })
          .eq("id", newMission.id)
        const mem = `# Mission brief\nPoste : ${fallbackBrief.titre_poste}\nLocalisation : ${fallbackBrief.localisation}\nMots-clés : ${fallbackBrief.mots_cles.join(", ")}`
        await sbAdmin.from("missions").update({ brief_memory: mem }).eq("id", newMission.id)
      }
    }
  }

  // ── Resolve missionId for run_mission ───────────────────────────────────────
  // gpt-4o-mini regularly copies the literal placeholder from the system prompt.
  // We detect that and fall back, in order:
  //   1. explicit attachedMissionId from the client
  //   2. the user's most recent mission in `preparation` (the one we just created)
  //   3. the freshly created mission from this very turn (newMission above)
  if (action?.type === "run_mission") {
    const mId = action.missionId as string | undefined
    const isPlaceholder =
      !mId ||
      mId === "..." ||
      mId.includes("CONTEXTE") ||
      mId.includes("COLLER") ||
      mId.includes("uuid") ||
      mId.includes("UUID") ||
      mId.includes("EXACT") ||
      !mId.includes("-")

    // Always pick the most recent launchable mission (preparation status)
    // for this user. This sidesteps gpt-4o copying old UUIDs from the
    // conversation history that point to already-completed or in-progress
    // missions (which would 409 on /launch-extension).
    const { data: latestPrep } = await sbAdmin
      .from("missions")
      .select("id, status, created_at")
      .eq("user_id", user.id)
      .eq("status", "preparation")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    // A mission is launchable if it belongs to the user AND its status is
    // anything but `in_progress` (re-runs allowed on completed/error/draft).
    const isLaunchable = (status: string | null) =>
      status !== "in_progress"

    let resolvedId: string | undefined
    if (!isPlaceholder && mId) {
      const { data: candMission } = await sbAdmin
        .from("missions")
        .select("id, status")
        .eq("id", mId)
        .eq("user_id", user.id)
        .maybeSingle()
      if (candMission && isLaunchable(candMission.status)) {
        resolvedId = candMission.id
      }
    }
    if (!resolvedId && attachedMissionId) {
      const { data: attached } = await sbAdmin
        .from("missions")
        .select("id, status")
        .eq("id", attachedMissionId)
        .eq("user_id", user.id)
        .maybeSingle()
      if (attached && isLaunchable(attached.status)) resolvedId = attached.id
    }
    if (!resolvedId && latestPrep?.id) resolvedId = latestPrep.id

    if (resolvedId) {
      action = { ...action, missionId: resolvedId }
    } else {
      // Nothing launchable — strip the action and rewrite the visible
      // assistant message so the user knows to start a new brief.
      action = null
      const fallbackText =
        "Je n'ai pas trouvé de mission prête à être lancée. Décrivez-moi le poste et le lieu pour créer une nouvelle mission."
      newAssistantMsg.content = fallbackText
      cleanContent = fallbackText
    }
  }

  // ── Handle update_brief ────────────────────────────────────────────────────
  if (action?.type === "update_brief" && action.missionId && action.brief) {
    try {
      const brief = typeof action.brief === "string" ? JSON.parse(action.brief) : action.brief
      await sbAdmin
        .from("missions")
        .update({ brief, status: "preparation" })
        .eq("id", action.missionId as string)
        .eq("user_id", user.id)
      const b = brief as Record<string, unknown>
      const mem = `# Mission brief\nPoste : ${b.titre_poste}\nLocalisation : ${b.localisation}\nMots-clés : ${Array.isArray(b.mots_cles) ? (b.mots_cles as string[]).join(", ") : ""}\nCritères : ${b.criteres ?? ""}\nTon : ${b.ton ?? ""}`
      await sbAdmin.from("missions").update({ brief_memory: mem }).eq("id", action.missionId as string).eq("user_id", user.id)
    } catch { /* ignore */ }
  }

  // Save messages + memory to Supabase
  await sbAdmin
    .from("profiles")
    .update({
      workspace_messages: savedMessages as unknown as Database["public"]["Tables"]["profiles"]["Update"]["workspace_messages"],
      ...(newWorkspaceMemory !== workspaceMemory ? { workspace_memory: newWorkspaceMemory } : {}),
    })
    .eq("user_id", user.id)

  // Update mission brief_memory if attached but no memory yet
  if (attachedMissionId && finalMessages.length > 0 && !missionMemory) {
    const missionSummary = `# Mission : ${missionTitle}\nContexte défini dans le chat workspace.`
    await sbAdmin
      .from("missions")
      .update({ brief_memory: missionSummary })
      .eq("id", attachedMissionId)
      .eq("user_id", user.id)
  }

  return NextResponse.json({
    content: cleanContent,
    action: action ?? undefined,
    compacted: approxTokens > COMPACTION_TOKEN_THRESHOLD,
  })
}

// DELETE — clear conversation history
export async function DELETE(req: NextRequest) {
  const cookieStore = await cookies()
  const sb = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try { toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {}
        },
      },
    }
  )

  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  await supabaseAdmin()
    .from("profiles")
    .update({ workspace_messages: [] })
    .eq("user_id", user.id)

  return NextResponse.json({ ok: true })
}

// GET — load message history
export async function GET(req: NextRequest) {
  const cookieStore = await cookies()
  const sb = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try { toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {}
        },
      },
    }
  )

  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: profile } = await sb
    .from("profiles")
    .select("workspace_messages, workspace_memory")
    .eq("user_id", user.id)
    .single()

  return NextResponse.json({
    messages: profile?.workspace_messages ?? [],
    hasMemory: !!profile?.workspace_memory,
  })
}
